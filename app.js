import cors from "cors";
import express from "express";
import helmet from "helmet";
import { corsOptions } from "./config/cors.js";
import { errorHandler, notFound } from "./middleware/error.middleware.js";
import adminRoutes from "./routes/admin.routes.js";
import adminAuthRoutes from "./routes/adminAuth.routes.js";
import appVersionRoutes from "./routes/appVersion.routes.js";
import authRoutes from "./routes/auth.routes.js";
import creditsRoutes from "./routes/credits.routes.js";
import exploreRoutes from "./routes/explore.routes.js";
import halokycRoutes from "./routes/halokyc.routes.js";
import matchRoomRoutes from "./routes/matchRoom.routes.js";
import messagesRoutes from "./routes/message.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import postRoutes from "./routes/post.routes.js";
import profileRoutes from "./routes/profile.routes.js";
import promptRoutes from "./routes/prompt.routes.js";
import pushRoutes from "./routes/push.routes.js";
import referralRoutes from "./routes/referral.routes.js";
import locationRoomRoutes from "./routes/locationRoom.routes.js";
import statusRoutes from "./routes/status.routes.js";
import thisOrThatRoutes from "./routes/thisOrThat.routes.js";
import webhooksRoutes from "./routes/webhooks.routes.js";

const app = express();

app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "ws://localhost:5000"],
    },
  },
}));
app.use(cors(corsOptions));
app.use("/api", webhooksRoutes);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => res.send("Lumore API is running!"));
app.use("/api/auth", authRoutes);
app.use("/api/status", statusRoutes);
app.use("/api/app-version", appVersionRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/post", postRoutes);
app.use("/api/prompt", promptRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/messages", messagesRoutes);
app.use("/api/inbox", matchRoomRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/rooms", locationRoomRoutes);
app.use("/api/halokyc", halokycRoutes);
app.use("/api/games/this-or-that", thisOrThatRoutes);
app.use("/api/credits", creditsRoutes);
app.use("/api/explore", exploreRoutes);
app.use("/api/referral", referralRoutes);
app.use("/api/admin/auth", adminAuthRoutes);
app.use("/api/admin", adminRoutes);
app.use(notFound);
app.use(errorHandler);

export default app;
