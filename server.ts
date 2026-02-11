// server.ts
import cors from "cors";
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import { createServer } from "http";
import swaggerUi from "swagger-ui-express";
import connectDB from "./config/db.js";
import { specs } from "./config/swagger.js";
import { errorHandler, notFound } from "./middleware/error.middleware.js";
import authRoutes from "./routes/auth.routes.js";
import matchRoomRoutes from "./routes/matchRoom.routes.js";
import messagesRoutes from "./routes/message.routes.js";
import postRoutes from "./routes/post.routes.js";
import profileRoutes from "./routes/profile.routes.js";
import promptRoutes from "./routes/prompt.routes.js";
import pushRoutes from "./routes/push.routes.js";
import statusRoutes from "./routes/status.routes.js";
import { initializeCronJobs } from "./services/cron.service.js";
import socketService from "./services/socket.service.js";

// Connect to MongoDB
connectDB();

const app = express();
const httpServer = createServer(app);

// Initialize Socket.io service
socketService.initialize(httpServer);

// Initialize cron jobs
initializeCronJobs();

// Middlewares re*
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", "ws://localhost:5000"],
      },
    },
  })
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Swagger UI
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));

// Basic route
app.get("/", (req, res) => {
  res.send("Lumore API is running!");
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/status", statusRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/post", postRoutes);
app.use("/api/prompt", promptRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/messages", messagesRoutes);
app.use("/api/inbox", matchRoomRoutes);

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Start the server
httpServer.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  console.log(
    `API Documentation available at http://localhost:${PORT}/api-docs`
  );
});



