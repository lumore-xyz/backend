// server.js
import cors from "cors";
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import { createServer } from "http";
import connectDB from "./config/db.js";
import { errorHandler, notFound } from "./middleware/error.middleware.js";
import adminRoutes from "./routes/admin.routes.js";
import adminAuthRoutes from "./routes/adminAuth.routes.js";
import authRoutes from "./routes/auth.routes.js";
import creditsRoutes from "./routes/credits.routes.js";
import diditRoutes from "./routes/didit.routes.js";
import matchRoomRoutes from "./routes/matchRoom.routes.js";
import messagesRoutes from "./routes/message.routes.js";
import postRoutes from "./routes/post.routes.js";
import profileRoutes from "./routes/profile.routes.js";
import promptRoutes from "./routes/prompt.routes.js";
import pushRoutes from "./routes/push.routes.js";
import referralRoutes from "./routes/referral.routes.js";
import statusRoutes from "./routes/status.routes.js";
import thisOrThatRoutes from "./routes/thisOrThat.routes.js";
import webhooksRoutes from "./routes/webhooks.routes.js";
import { initializeCronJobs } from "./services/cron.service.js";
import socketService from "./services/socket.service.js";

// Connect to MongoDB
connectDB();

const app = express();
const httpServer = createServer(app);

const defaultAllowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "https://lumore.xyz",
  "https://www.lumore.xyz",
];

const envAllowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = Array.from(
  new Set(
    [
      process.env.CLIENT_URL,
      ...defaultAllowedOrigins,
      ...envAllowedOrigins,
    ].filter(Boolean),
  ),
);

const isAllowedOrigin = (origin = "") => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;

  try {
    const parsed = new URL(origin);
    return (
      parsed.protocol === "https:" && parsed.hostname.endsWith(".lumore.xyz")
    );
  } catch {
    return false;
  }
};

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    console.warn(`[cors] Blocked origin: ${origin}`);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
  ],
  credentials: true,
  optionsSuccessStatus: 204,
};

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
  }),
);
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use("/api", webhooksRoutes);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.use("/api/didit", diditRoutes);
app.use("/api/games/this-or-that", thisOrThatRoutes);
app.use("/api/credits", creditsRoutes);
app.use("/api/referral", referralRoutes);
app.use("/api/admin/auth", adminAuthRoutes);
app.use("/api/admin", adminRoutes);

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Start the server
httpServer.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
