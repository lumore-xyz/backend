import Message from "../models/Message.js";
import { findMatch } from "./profileController.js";

// Store users waiting for a random chat
const waitingPool = new Map(); // Key: socket.id, Value: { userProfileData }

export const initializeSocket = (io) => {
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    const { preferences, publicKey } = socket.handshake.auth;

    // When a user requests a random chat
    socket.on("findRandomChat", async (userProfile) => {
      console.log(`User ${socket.id} is looking for a match...`);
      const match = await findMatch(socket.id, userProfile);

      if (match) {
        const roomId = `room_${socket.id}_${match.socketId}`;
        socket.join(roomId);
        io.to(match.socketId).emit("matchFound", { roomId });
        io.to(socket.id).emit("matchFound", { roomId });

        // Remove both users from waiting pool
        waitingPool.delete(socket.id);
        waitingPool.delete(match.socketId);
      } else {
        // Add user to waiting pool if no match is found
        waitingPool.set(socket.id, userProfile);
      }
    });

    // Handle encrypted messages
    socket.on("sendMessage", async (data) => {
      const { roomId, encryptedMessage } = data;

      try {
        // Broadcast the message to the room
        await socket.to(roomId).emit("encrypted-message", encryptedMessage);

        // If it's a slot chat, save the message to the database
        if (roomId.startsWith("slot_")) {
          const message = new Message({
            roomId,
            encryptedContent: encryptedMessage,
            timestamp: new Date(),
          });
          await message.save();
        }
      } catch (error) {
        console.error("Error sending message:", error);
      }
    });

    // Handle disconnections
    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      waitingPool.delete(socket.id);
    });
  });
};
