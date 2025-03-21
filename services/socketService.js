import { Server } from "socket.io";
import { initializeSocket } from "../controllers/socketController.js";

class SocketService {
  constructor() {
    this.io = null;
  }

  initialize(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      },
    });

    initializeSocket(this.io);
  }

  getIO() {
    if (!this.io) {
      throw new Error("Socket.io not initialized!");
    }
    return this.io;
  }
}

export default new SocketService();
