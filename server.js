// server.js
import cors from "cors";
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import { createServer } from "http";
import passport from "passport";
import swaggerUi from "swagger-ui-express";
import connectDB from "./config/db.js";
import "./config/passport.js";
import { specs } from "./config/swagger.js";
import { errorHandler, notFound } from "./middleware/errorMiddleware.js";
import authRoutes from "./routes/authRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import slotRoutes from "./routes/slotRoutes.js";
import messagesRoutes from "./routes/messagesRoutes.js";
import { initializeCronJobs } from "./services/cronService.js";
import socketService from "./services/socketService.js";

// Connect to MongoDB
connectDB();

const app = express();
const httpServer = createServer(app);

// Initialize Socket.io service
socketService.initialize(httpServer);

// Initialize cron jobs
initializeCronJobs();

// Passport initialization
app.use(passport.initialize());

// Middleware
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
app.use("/api/profile", profileRoutes);
app.use("/api/slots", slotRoutes);
app.use("/api/messages", messagesRoutes);

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
