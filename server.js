// server.js
import cors from "cors";
import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { createServer } from "http";
import passport from "passport";
import { Server } from "socket.io";
import connectDB from "./config/db.js";
import "./config/passport.js";
import { errorHandler, notFound } from "./middleware/errorMiddleware.js";
import Message from "./models/Message.js";
import authRoutes from "./routes/authRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";

// Connect to MongoDB
connectDB();

const app = express();
const httpServer = createServer(app);

// Socket.io setup
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000", // Replace with frontend URL
    methods: ["GET", "POST"],
  },
});

// Store users waiting for a random chat
const waitingPool = new Map(); // Key: socket.id, Value: { userProfileData }

// Passport initialization
app.use(passport.initialize());

// Middleware
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", "ws://localhost:5000"], // Allow WebSocket connections
      },
    },
  })
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting (100 requests per 15 minutes) - Apply only to REST APIs
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests, please try again later.",
});
app.use("/api/", limiter);

// Basic route
app.get("/", (req, res) => {
  res.send("Lumore API is running!");
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

// Socket.io connection
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  const { preferences, publicKey } = socket.handshake.auth;

  // When a user requests a random chat
  socket.on("findRandomChat", async (userProfile) => {
    console.log(`User ${socket.id} is looking for a match...`);
    const match = findMatch(socket.id, userProfile);

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

const PORT = process.env.PORT || 5000;

// Start the server
httpServer.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
