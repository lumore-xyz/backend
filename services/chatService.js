import crypto from "crypto";
import { Server } from "socket.io";

import Message from "../models/Message.js";
import User from "../models/User.js";
import { encryptionService } from "./encryptionService.js";
import { keyExchangeService } from "./keyExchangeService.js";
import matchingService from "./matchingService.js";

class ChatService {
  constructor() {
    this.io = null;
    this.userSockets = new Map(); // userId -> socket
    this.socketUsers = new Map(); // socketId -> userId
  }

  initialize(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.CLIENT_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true,
        allowedHeaders: ["*"],
      },
      pingTimeout: 60000,
      pingInterval: 25000,
      transports: ["websocket", "polling"],
    });

    // Create a namespace for the chat
    const chatNamespace = this.io.of("/api/chat");
    chatNamespace.on("connection", (socket) => {
      console.log("New client connected to chat namespace:", socket.id);
      this.handleConnection(socket);
    });
  }

  handleConnection(socket) {
    console.log("New client connected:", socket.id);

    // Handle ping
    socket.on("ping", () => {
      console.log(`Ping received from socket ${socket.id}`);
      const userId = this.socketUsers.get(socket.id);
      if (userId) {
        this.updateUserActivity(userId);
        // Send a pong back to confirm the connection is alive
        socket.emit("pong");
      }
    });

    // Authenticate user
    socket.on("authenticate", async (userId) => {
      try {
        console.log("Authenticating user:", userId);
        const user = await User.findById(userId);
        if (!user) {
          console.error("User not found:", userId);
          socket.emit("error", { message: "User not found" });
          return;
        }

        // Set user as active and update last active timestamp
        const updatedUser = await User.findByIdAndUpdate(
          userId,
          {
            isActive: true,
            lastActive: new Date(),
          },
          { new: true }
        );
        console.log(`User ${userId} is now active:`, updatedUser.isActive);

        // Store socket mappings
        this.userSockets.set(userId, socket);
        this.socketUsers.set(socket.id, userId);

        // Send authentication success with user data
        socket.emit("authenticated", { userId: user._id });

        // Send initial pong to confirm connection
        socket.emit("pong");
      } catch (error) {
        console.error("Authentication error:", error);
        socket.emit("error", { message: error.message });
      }
    });

    // Handle new message
    socket.on("send_message", async (data) => {
      try {
        const { recipientId, content, encryptedContent, iv } = data;
        const senderId = this.socketUsers.get(socket.id);

        if (!senderId) {
          socket.emit("error", { message: "Not authenticated" });
          return;
        }

        // Verify users are matched
        const [sender, recipient] = await Promise.all([
          User.findById(senderId),
          User.findById(recipientId),
        ]);

        if (!sender || !recipient) {
          socket.emit("error", { message: "User not found" });
          return;
        }

        if (
          sender.activeMatch?.toString() !== recipientId ||
          recipient.activeMatch?.toString() !== senderId
        ) {
          socket.emit("error", { message: "Users are not matched" });
          return;
        }

        // Save encrypted message to database
        const message = await Message.create({
          sender: senderId,
          receiver: recipientId,
          encryptedData: encryptedContent,
          iv: iv,
        });

        // Emit encrypted message to recipient if online
        const recipientSocket = this.userSockets.get(recipientId);
        if (recipientSocket) {
          recipientSocket.emit("new_message", {
            senderId,
            encryptedData: encryptedContent,
            iv: iv,
            timestamp: message.timestamp,
          });
        }

        // Acknowledge message sent
        socket.emit("message_sent", {
          messageId: message._id,
          timestamp: message.timestamp,
        });
      } catch (error) {
        socket.emit("error", { message: error.message });
      }
    });

    // Handle profile visibility toggle
    socket.on("toggle_profile_visibility", async (data) => {
      try {
        const { matchId, isVisible } = data;
        const userId = this.socketUsers.get(socket.id);

        if (!userId) {
          socket.emit("error", { message: "Not authenticated" });
          return;
        }

        const user = await User.findById(userId);
        if (!user) {
          socket.emit("error", { message: "User not found" });
          return;
        }

        user.fieldVisibility = isVisible;
        await user.save();

        // Notify match about visibility change
        const matchSocket = this.userSockets.get(matchId);
        if (matchSocket) {
          matchSocket.emit("profile_visibility_changed", {
            userId,
            isVisible,
          });
        }

        socket.emit("profile_visibility_updated", { isVisible });
      } catch (error) {
        socket.emit("error", { message: error.message });
      }
    });

    // Handle key exchange initialization
    socket.on("init_key_exchange", async (data) => {
      try {
        const { matchId } = data;
        const userId = this.socketUsers.get(socket.id);

        if (!userId) {
          socket.emit("error", { message: "Not authenticated" });
          return;
        }

        // Generate keys for the initiating user
        const keys = keyExchangeService.generateKeyPair();
        keyExchangeService.storeTempKeys(userId, keys);

        // Send public key info to the match
        const matchSocket = this.userSockets.get(matchId);
        if (matchSocket) {
          matchSocket.emit("key_exchange_request", {
            fromUserId: userId,
            publicKey: keys.publicKey,
            prime: keys.prime,
            generator: keys.generator,
          });
        }
      } catch (error) {
        socket.emit("error", { message: error.message });
      }
    });

    // Handle key exchange response
    socket.on("key_exchange_response", async (data) => {
      try {
        const { initiatorId, responderPublicKey } = data;
        const responderId = this.socketUsers.get(socket.id);

        if (!responderId) {
          socket.emit("error", { message: "Not authenticated" });
          return;
        }

        // Get initiator's temporary keys
        const initiatorKeys = keyExchangeService.getTempKeys(initiatorId);
        if (!initiatorKeys) {
          socket.emit("error", { message: "Key exchange timeout" });
          return;
        }

        // Generate responder's keys using the same prime and generator
        const dh = crypto.createDiffieHellman(
          Buffer.from(initiatorKeys.prime, "base64"),
          Buffer.from(initiatorKeys.generator, "base64")
        );
        dh.generateKeys();

        // Compute shared secret for responder
        const responderSharedSecret = keyExchangeService.computeSharedSecret(
          dh.getPrivateKey("base64"),
          responderPublicKey,
          initiatorKeys.prime,
          initiatorKeys.generator
        );

        // Send responder's public key to initiator
        const initiatorSocket = this.userSockets.get(initiatorId);
        if (initiatorSocket) {
          initiatorSocket.emit("key_exchange_complete", {
            fromUserId: responderId,
            publicKey: dh.getPublicKey("base64"),
          });
        }

        // Store the shared secret for the responder (in their browser)
        socket.emit("store_encryption_key", {
          matchId: initiatorId,
          key: responderSharedSecret,
        });
      } catch (error) {
        socket.emit("error", { message: error.message });
      }
    });

    // Handle key exchange completion
    socket.on("process_key_exchange_completion", async (data) => {
      try {
        const { matchId, matchPublicKey } = data;
        const userId = this.socketUsers.get(socket.id);

        if (!userId) {
          socket.emit("error", { message: "Not authenticated" });
          return;
        }

        // Get initiator's temporary keys
        const myKeys = keyExchangeService.getTempKeys(userId);
        if (!myKeys) {
          socket.emit("error", { message: "Key exchange timeout" });
          return;
        }

        // Compute shared secret for initiator
        const initiatorSharedSecret = keyExchangeService.computeSharedSecret(
          myKeys.privateKey,
          matchPublicKey,
          myKeys.prime,
          myKeys.generator
        );

        // Store the shared secret for the initiator (in their browser)
        socket.emit("store_encryption_key", {
          matchId,
          key: initiatorSharedSecret,
        });
      } catch (error) {
        socket.emit("error", { message: error.message });
      }
    });

    // Handle disconnection
    socket.on("disconnect", async () => {
      const userId = this.socketUsers.get(socket.id);
      if (userId) {
        // Check if user has other active connections
        const hasOtherConnections = Array.from(this.socketUsers.entries()).some(
          ([sid, uid]) => uid === userId && sid !== socket.id
        );

        if (!hasOtherConnections) {
          // Only set user as inactive if they have no other active connections
          try {
            const updatedUser = await User.findByIdAndUpdate(
              userId,
              {
                isActive: false,
                lastActive: new Date(),
              },
              { new: true }
            );
            console.log(
              `User ${userId} is now inactive:`,
              updatedUser.isActive
            );
          } catch (error) {
            console.error("Error updating user active status:", error);
          }
        } else {
          console.log(`User ${userId} still has other active connections`);
        }

        this.userSockets.delete(userId);
        this.socketUsers.delete(socket.id);
      }
      console.log("Client disconnected:", socket.id);
    });
  }

  async updateUserActivity(userId) {
    try {
      await User.findByIdAndUpdate(
        userId,
        { lastActive: new Date() },
        { new: true }
      );
    } catch (error) {
      console.error("Error updating user activity:", error);
    }
  }

  // Helper method to emit to specific user
  emitToUser(userId, event, data) {
    const socket = this.userSockets.get(userId);
    if (socket) {
      socket.emit(event, data);
    }
  }

  // Helper method to emit to all users
  emitToAll(event, data) {
    this.io.emit(event, data);
  }
}

export default new ChatService();
