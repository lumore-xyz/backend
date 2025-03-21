import { Server } from "socket.io";

import User from "../models/User.js";
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
      },
    });

    this.io.on("connection", this.handleConnection.bind(this));
  }

  handleConnection(socket) {
    console.log("New client connected");

    // Authenticate user
    socket.on("authenticate", async (userId) => {
      try {
        const user = await User.findById(userId);
        if (!user) {
          socket.emit("error", { message: "User not found" });
          return;
        }

        this.userSockets.set(userId, socket);
        this.socketUsers.set(socket.id, userId);
        socket.emit("authenticated", { userId });
      } catch (error) {
        socket.emit("error", { message: error.message });
      }
    });

    // Handle new message
    socket.on("send_message", async (data) => {
      try {
        const { recipientId, content } = data;
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

        // Create message object
        const message = {
          sender: senderId,
          content,
          timestamp: new Date(),
        };

        // Emit message to recipient if online
        const recipientSocket = this.userSockets.get(recipientId);
        if (recipientSocket) {
          recipientSocket.emit("new_message", {
            senderId,
            content,
            timestamp: message.timestamp,
          });
        }

        // Save message to both users' saved chats
        await matchingService.saveChat(senderId, recipientId, [message]);

        // Acknowledge message sent
        socket.emit("message_sent", message);
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

    // Handle disconnection
    socket.on("disconnect", () => {
      const userId = this.socketUsers.get(socket.id);
      if (userId) {
        this.userSockets.delete(userId);
        this.socketUsers.delete(socket.id);
      }
      console.log("Client disconnected");
    });
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
