import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import User from "../models/user.model.js";
import { corsOptions } from "../config/cors.js";
import { getId } from "../utils/matchIds.js";
import { logError } from "../utils/logError.js";
import {
  isUserActivityDue,
  recordUserActivity,
} from "./userActivity.service.js";
import { registerProfileLockHandlers } from "./socketProfileLock.service.js";
import { registerChatHandlers } from "./socketChat.service.js";

let chatNamespace;

const emitToUser = (userId, event, payload) => {
  const id = getId(userId);
  if (!id || !chatNamespace) return;
  chatNamespace.to(id).emit(event, payload);
};

const emitToUsers = (userIds = [], event, payload) => {
  for (const userId of new Set(userIds.map(getId).filter(Boolean))) {
    emitToUser(userId, event, payload);
  }
};

const emitToRoom = (roomId, event, payload) => {
  const id = getId(roomId);
  if (!id || !chatNamespace) return;
  chatNamespace.to(id).emit(event, payload);
};

export const disconnectUser = (userId) => {
  const id = getId(userId);
  if (!id || !chatNamespace) return;
  chatNamespace.in(id).disconnectSockets(true);
};

const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) throw new Error("No token");

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    const user = await User.findById(decoded.id)
      .select("_id isArchived")
      .lean();

    if (!user || user.isArchived) throw new Error("User is unavailable");

    socket.user = user;
    next();
  } catch {
    next(new Error("Authentication error"));
  }
};

const initialize = (server) => {
  const io = new Server(server, {
    cors: corsOptions,
  });

  chatNamespace = io.of("/api/chat");
  chatNamespace.use(authenticateSocket);
  chatNamespace.on("connection", handleConnection);
};

export const handleConnection = (socket) => {
  const userId = socket.user._id.toString();
  let lastActivityAt = new Date();
  socket.join(userId);

  const markOnline = User.updateOne(
    { _id: userId },
    {
      $set: {
        isActive: true,
        socketId: socket.id,
        lastActive: new Date(),
      },
    },
  ).catch((error) => {
    logError("Failed to mark socket user online", error);
  });

  socket.use((_packet, next) => {
    const now = new Date();
    if (isUserActivityDue(lastActivityAt, now)) {
      lastActivityAt = now;
      recordUserActivity(userId, now).catch((error) => {
        logError("Failed to record socket activity", error);
      });
    }
    next();
  });

  registerProfileLockHandlers(socket, userId);
  registerChatHandlers(socket, { userId });

  socket.on("disconnect", async () => {
    await markOnline;
    try {
      const [remainingSocket] = await chatNamespace
        .in(userId)
        .fetchSockets();
      await User.findOneAndUpdate(
        { _id: userId, socketId: socket.id },
        {
          $set: {
            isActive: Boolean(remainingSocket),
            socketId: remainingSocket?.id || null,
          },
        },
      );
    } catch (error) {
      logError("Failed to mark socket user offline", error);
    }
  });
};

export default { initialize, emitToUser, emitToUsers, emitToRoom, disconnectUser };
