/**
 * ============================================================
 * Lumore – Real-time Chat & Matchmaking Socket Service
 * ============================================================
 *
 * Dev Philosophy:
 * - No swipe culture → intentional, system-driven matching
 * - One active match at a time per user
 * - Privacy-first (encrypted messages, minimal data exposure)
 * - Optimize DB access for scale (no N+1 queries)
 *
 * Scaling Notes:
 * - `userSockets` is in-memory (single instance)
 * - For horizontal scaling, replace with Redis adapter
 * - Matchmaking can be moved to a worker/queue later
 */
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import Message from "../models/message.model.js";
import MatchRoom from "../models/room.model.js";
import UnlockHistory from "../models/unlock.model.js";
import User from "../models/user.model.js";
import {
  CREDIT_RULES,
  spendCreditsForConversationStart,
} from "./credits.service.js";
import { keyExchangeService } from "./key.service.js";
import { getOrCreateMatchRoom } from "./matching.service.js";
import { findBestMatchV2 } from "./matchmaking.service.js";
import { sendNotificationToUser } from "./push.service.js";

/**
 * ============================================================
 * Shared Runtime State
 * ============================================================
 *
 * NOTE:
 * - userSockets maps userId → active socket instance
 * - This is ephemeral and resets on server restart
 * - DO NOT store critical state here
 */
let io = null;
const userSockets = new Map();

const DEFAULT_REACTION_EMOJI = "\u2764\uFE0F";

const isParticipant = (room, currentUserId) =>
  room?.participants?.some((id) => id.toString() === currentUserId.toString());

const normalizeReplyMessage = (replyDoc) => {
  if (!replyDoc) return null;
  return {
    _id: replyDoc._id?.toString(),
    senderId: replyDoc.sender?._id
      ? replyDoc.sender._id.toString()
      : replyDoc.sender?.toString?.() || null,
    encryptedData: replyDoc.encryptedData ? replyDoc.encryptedData.toString() : null,
    iv: replyDoc.iv ? replyDoc.iv.toString() : null,
    messageType: replyDoc.messageType || "text",
    imageUrl: replyDoc.imageUrl || null,
    editedAt: replyDoc.editedAt || null,
    createdAt: replyDoc.createdAt || null,
  };
};

const normalizeMessagePayload = (messageDoc, extra = {}) => ({
  _id: messageDoc._id.toString(),
  roomId: messageDoc.roomId,
  senderId: messageDoc.sender?.toString?.() || null,
  receiverId: messageDoc.receiver?.toString?.() || null,
  messageType: messageDoc.messageType || "text",
  encryptedData: messageDoc.encryptedData ? messageDoc.encryptedData.toString() : null,
  iv: messageDoc.iv ? messageDoc.iv.toString() : null,
  imageUrl: messageDoc.imageUrl || null,
  imagePublicId: messageDoc.imagePublicId || null,
  replyTo: normalizeReplyMessage(messageDoc.replyTo),
  reactions: (messageDoc.reactions || []).map((reaction) => ({
    userId: reaction.user?.toString?.() || null,
    emoji: reaction.emoji || DEFAULT_REACTION_EMOJI,
  })),
  editedAt: messageDoc.editedAt || null,
  deliveredAt: messageDoc.deliveredAt || null,
  readAt: messageDoc.readAt || null,
  createdAt: messageDoc.createdAt,
  timestamp: new Date(messageDoc.createdAt).getTime(),
  ...extra,
});

/* ============================================================
 * AUTHENTICATION MIDDLEWARE
 * ============================================================
 *
 * Dev Notes:
 * - Uses JWT passed via socket.handshake.auth.token
 * - Keeps payload minimal (no password, no heavy fields)
 * - socket.user becomes the single source of truth
 * - All downstream handlers rely on socket.user
 */
const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) throw new Error("No token");

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    const user = await User.findById(decoded.id)
      .select("_id isActive lastActive")
      .lean();

    if (!user) throw new Error("User not found");

    socket.user = user;
    next();
  } catch (err) {
    next(new Error("Authentication error"));
  }
};

/* ============================================================
 * SOCKET.IO INITIALIZATION
 * ============================================================
 *
 * Dev Notes:
 * - Uses a dedicated namespace: /api/chat
 * - Keeps chat isolated from other real-time features
 * - CORS restricted to client URL
 */
const initialize = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:3000",
      credentials: true,
    },
  });

  const ns = io.of("/api/chat");
  ns.use(authenticateSocket);
  ns.on("connection", handleConnection);
};

/* ============================================================
 * MATCHMAKING ENGINE (CORE LOGIC)
 * ============================================================
 *
 * Philosophy:
 * - NOT swipe-based
 * - NOT random
 * - Deterministic, explainable, and user-respecting
 * - Designed to avoid "empty room" scenarios without
 *   degrading match quality
 *
 * High-Level Strategy:
 * 1. Geo-filter nearby users (distance-based)
 * 2. Filter by basic availability & intent (isMatching, gender)
 * 3. Batch-load preferences to avoid N+1 DB queries
 * 4. Normalize preferences to handle missing/optional fields
 * 5. Score all viable candidates using weighted criteria
 * 6. Enforce mutual interest when possible
 *
 * Match Types:
 * ------------------------------------------------------------
 * STRICT MATCH
 * - Mutual interest passes for BOTH users
 * - Age, gender, distance, intent all respected
 * - Highest quality and default desired outcome
 *
 * FALLBACK MATCH
 * - Used ONLY when no strict match exists
 * - Still score-based (no random pairing)
 * - Prevents users from being stuck waiting indefinitely
 * - Maintains minimum compatibility threshold (score > 0)
 *
 * Decision Hierarchy:
 * ------------------------------------------------------------
 * 1. Return best STRICT match (highest score)
 * 2. Else return best FALLBACK match (highest score)
 * 3. Else return null (no viable humans nearby)
 *
 * Important Guarantees:
 * ------------------------------------------------------------
 * - Only ONE best match is returned
 * - No infinite loops or broadcast matching
 * - No preference mutation inside the loop
 * - Same inputs => same output (deterministic)
 *
 * Future Extensions (Planned):
 * ------------------------------------------------------------
 * - Match quality tiers (A / B / C)
 * - Cooldown weighting (avoid repeat matches)
 * - Explainable match reasons ("Matched because...")
 * - Time-based relaxation of strict rules
 */
/* ============================================================
 * MATCH CREATION & NOTIFICATION
 * ============================================================
 *
 * Dev Notes:
 * - Persists match via matchingService
 * - Both users share a deterministic roomId
 * - Socket joins are defensive (socket may be offline)
 * - Push notifications are sent regardless of socket state
 */
const createAndNotifyMatch = async (userId1, userId2, matchingNote = null) => {
  const creditSpend = await spendCreditsForConversationStart(userId1, userId2);
  if (!creditSpend.success) {
    return { success: false, reason: creditSpend.reason };
  }

  const room = await getOrCreateMatchRoom(userId1, userId2, matchingNote);
  await User.updateMany(
    { _id: { $in: [userId1, userId2] } },
    {
      $set: {
        isMatching: false,
      },
    }
  );

  const roomId = room._id.toString();

  const s1 = userSockets.get(userId1);
  const s2 = userSockets.get(userId2);

  const matchNotificationForUser1 = sendNotificationToUser(userId1, {
    title: "Match found!",
    body: "You have a new match on Lumore.",
    tag: `match-${roomId}`,
    data: {
      type: "match",
      roomId,
      matchedUserId: userId2,
      url: `/app/chat/${roomId}`,
    },
  });

  const matchNotificationForUser2 = sendNotificationToUser(userId2, {
    title: "Match found!",
    body: "You have a new match on Lumore.",
    tag: `match-${roomId}`,
    data: {
      type: "match",
      roomId,
      matchedUserId: userId1,
      url: `/app/chat/${roomId}`,
    },
  });

  if (s1) {
    s1.join(roomId);
    s1.emit("creditsUpdated", {
      credits: creditSpend.balances[userId1],
      reason: "conversation_start",
    });
    s1.emit("matchFound", {
      roomId,
      matchedUser: userId2,
      matchedUserId: userId2,
      matchingNote: room?.matchingNote || matchingNote || null,
    });
  }

  if (s2) {
    s2.join(roomId);
    s2.emit("creditsUpdated", {
      credits: creditSpend.balances[userId2],
      reason: "conversation_start",
    });
    s2.emit("matchFound", {
      roomId,
      matchedUser: userId1,
      matchedUserId: userId1,
      matchingNote: room?.matchingNote || matchingNote || null,
    });
  }

  await Promise.allSettled([matchNotificationForUser1, matchNotificationForUser2]);
  return { success: true, roomId, balances: creditSpend.balances };
};

/* ============================================================
 * SOCKET CONNECTION HANDLER
 * ============================================================
 *
 * Lifecycle:
 * - Register socket
 * - Mark user online
 * - Listen for matchmaking & messaging
 * - Cleanup on disconnect
 */
const handleConnection = (socket) => {
  const userId = socket.user._id.toString();
  userSockets.set(userId, socket);
  const logMatchStep = () => {};

  const markRoomMessagesReadAndDelivered = async (roomId) => {
    const now = new Date();
    const deliveredFilter = {
      roomId,
      receiver: userId,
      deliveredAt: null,
    };
    const readFilter = {
      roomId,
      receiver: userId,
      readAt: null,
    };

    const deliveredMessages = await Message.find(deliveredFilter).select("_id").lean();
    const readMessages = await Message.find(readFilter).select("_id").lean();

    if (deliveredMessages.length > 0) {
      await Message.updateMany(deliveredFilter, { $set: { deliveredAt: now } });
      const deliveredMessageIds = deliveredMessages.map((m) => m._id.toString());
      socket.nsp.to(roomId).emit("message_delivered", {
        roomId,
        messageIds: deliveredMessageIds,
        deliveredAt: now.toISOString(),
      });
    }

    if (readMessages.length > 0) {
      await Message.updateMany(readFilter, {
        $set: { readAt: now, deliveredAt: now },
      });
      const readMessageIds = readMessages.map((m) => m._id.toString());
      socket.nsp.to(roomId).emit("message_read", {
        roomId,
        messageIds: readMessageIds,
        readAt: now.toISOString(),
      });
    }
  };

  // Fire-and-forget presence update
  User.findByIdAndUpdate(userId, {
    isActive: true,
    socketId: socket.id,
    lastActive: new Date(),
  }).lean();

  /* -------- Matchmaking -------- */
  socket.on("startMatchmaking", async () => {
    try {
      logMatchStep("start_requested", { socketId: socket.id });

      const currentUser = await User.findById(userId).select("credits").lean();
      logMatchStep("credits_fetched", { credits: currentUser?.credits ?? null });

      if (!currentUser || currentUser.credits < CREDIT_RULES.CONVERSATION_COST) {
        logMatchStep("credits_insufficient", {
          credits: currentUser?.credits ?? 0,
          required: CREDIT_RULES.CONVERSATION_COST,
        });
        socket.emit("insufficientCredits", {
          message: "You need at least 1 credit to start matchmaking.",
          credits: currentUser?.credits || 0,
          required: CREDIT_RULES.CONVERSATION_COST,
        });
        socket.emit("matchmakingError", {
          message: "Not enough credits to start matchmaking.",
        });
        return;
      }

      await User.findByIdAndUpdate(userId, {
        isMatching: true,
        matchmakingTimestamp: Date.now(),
      });
      logMatchStep("user_marked_matching");

      const match = await findBestMatchV2({ userId, now: new Date() });
      logMatchStep("match_lookup_completed", {
        found: Boolean(match),
        matchedUserId: match?.uid || null,
        mode: match?.mode || null,
        score: match?.score ?? null,
      });

      if (match) {
        const created = await createAndNotifyMatch(
          userId,
          match.uid,
          match.matchingNote || null
        );
        logMatchStep("create_and_notify_result", {
          success: Boolean(created?.success),
          reason: created?.reason || null,
          roomId: created?.roomId || null,
        });

        if (!created?.success) {
          await User.findByIdAndUpdate(userId, { isMatching: false });
          logMatchStep("user_unmarked_matching_after_failed_create");
          socket.emit("matchmakingError", {
            message: "Unable to start conversation due to insufficient credits.",
          });
        }
      } else {
        logMatchStep("no_match_found");
      }
    } catch (e) {
      logMatchStep("start_failed", { error: e?.message || "Unknown error" });
      socket.emit("matchmakingError", { message: e.message });
    }
  });

  socket.on("stopMatchmaking", async () => {
    await User.findByIdAndUpdate(userId, {
      isMatching: false,
      matchmakingTimestamp: null,
    });
    socket.emit("matchmakingStopped", { message: "Matchmaking stopped" });
  });

  /* -------- Chat -------- */
  socket.on("joinChat", async ({ roomId }) => {
    if (!roomId) return;
    socket.join(roomId);

    try {
      const room = await MatchRoom.findById(roomId).lean();
      if (!room || !isParticipant(room, userId)) return;
      await markRoomMessagesReadAndDelivered(roomId);
    } catch (error) {
      console.error("[joinChat] Error:", error);
    }
  });

  // ==================== CHAT CANCELLATION ====================

  socket.on("endChat", async ({ roomId }) => {
    const room = await MatchRoom.findById(roomId);
    if (!room) return;

    if (!room.participants.includes(userId)) return;

    room.status = "archive";
    room.endedBy = userId;
    await room.save();

    socket.to(roomId).emit("chatEnded", {
      endedBy: userId,
    });
    socket.leave(roomId);
  });

  socket.on("send_message", async (data) => {
    try {
      const {
        roomId,
        encryptedContent,
        iv,
        receiverId,
        replyTo,
        messageType = "text",
        imageUrl = null,
        imagePublicId = null,
        clientMessageId = null,
      } = data || {};

      const room = await MatchRoom.findById(roomId).lean();
      if (!room) return;
      if (!isParticipant(room, userId)) return;
      if (room.status !== "active") return;

      if (messageType === "text" && (!encryptedContent || !iv)) return;
      if (messageType === "image" && !imageUrl) return;

      let replyMessage = null;
      if (replyTo) {
        replyMessage = await Message.findOne({ _id: replyTo, roomId })
          .select("_id sender messageType encryptedData iv imageUrl editedAt createdAt")
          .lean();
      }

      const receiverSocket = receiverId ? userSockets.get(receiverId.toString()) : null;
      const receiverInRoom = Boolean(receiverSocket?.rooms?.has(roomId));
      const now = new Date();

      const createdMessage = await Message.create({
        sender: userId,
        receiver: receiverId,
        roomId,
        messageType,
        encryptedData: messageType === "text" ? encryptedContent : undefined,
        iv: messageType === "text" ? iv : undefined,
        imageUrl: messageType === "image" ? imageUrl : null,
        imagePublicId: messageType === "image" ? imagePublicId : null,
        replyTo: replyMessage?._id || null,
        deliveredAt: receiverInRoom ? now : null,
        readAt: receiverInRoom ? now : null,
      });

      const payload = normalizeMessagePayload(
        {
          ...createdMessage.toObject(),
          replyTo: replyMessage,
        },
        { clientMessageId }
      );

      socket.to(roomId).emit("new_message", payload);
      socket.emit("message_sent", payload);

      if (receiverInRoom) {
        socket.emit("message_delivered", {
          roomId,
          messageIds: [createdMessage._id.toString()],
          deliveredAt: now.toISOString(),
        });
        socket.emit("message_read", {
          roomId,
          messageIds: [createdMessage._id.toString()],
          readAt: now.toISOString(),
        });
      }

      const unreadIncrements = {};
      for (const participantId of room.participants || []) {
        const pid = participantId.toString();
        if (
          pid !== userId &&
          !(receiverInRoom && receiverId && pid === receiverId.toString())
        ) {
          unreadIncrements[`unreadCounts.${pid}`] = 1;
        }
      }

      await MatchRoom.findByIdAndUpdate(roomId, {
        $set: {
          lastMessageAt: new Date(),
          lastMessage: {
            sender: userId,
            messageType,
            encryptedData: messageType === "text" ? encryptedContent : null,
            iv: messageType === "text" ? iv : null,
            imageUrl: messageType === "image" ? imageUrl : null,
            createdAt: new Date(),
          },
        },
        ...(Object.keys(unreadIncrements).length
          ? { $inc: unreadIncrements }
          : {}),
      });

      socket.emit("inbox_updated", {
        roomId,
        status: room.status,
      });

      if (receiverId && receiverId !== userId) {
        if (receiverSocket) {
          receiverSocket.emit("inbox_updated", {
            roomId,
            status: room.status,
          });
        }
      }

      if (receiverId && receiverId !== userId) {
        await sendNotificationToUser(receiverId, {
          title: "New message",
          body: "You received a new message on Lumore.",
          tag: `message-${roomId}`,
          data: {
            type: "message",
            roomId,
            senderId: userId,
            url: `/app/chat/${roomId}`,
          },
        });
      }
    } catch (error) {
      console.error("[send_message] Error:", error);
      socket.emit("error", { message: "Unable to send message" });
    }
  });

  socket.on("typing", (data) => {
    const { roomId, isTyping } = data || {};
    if (!roomId) return;
    socket.to(roomId).emit("typing", { roomId, userId, isTyping: Boolean(isTyping) });
  });

  socket.on("edit_message", async (data) => {
    try {
      const { roomId, messageId, encryptedContent, iv } = data || {};
      if (!roomId || !messageId || !encryptedContent || !iv) return;

      const room = await MatchRoom.findById(roomId).lean();
      if (!room || !isParticipant(room, userId) || room.status !== "active") return;

      const message = await Message.findOne({
        _id: messageId,
        roomId,
        sender: userId,
        messageType: "text",
      });

      if (!message) return;

      message.encryptedData = encryptedContent;
      message.iv = iv;
      message.editedAt = new Date();
      await message.save();

      socket.nsp.to(roomId).emit("message_edited", {
        roomId,
        messageId: message._id.toString(),
        encryptedData: message.encryptedData.toString(),
        iv: message.iv.toString(),
        editedAt: message.editedAt,
      });
    } catch (error) {
      console.error("[edit_message] Error:", error);
      socket.emit("error", { message: "Unable to edit message" });
    }
  });

  socket.on("toggle_message_reaction", async (data) => {
    try {
      const { roomId, messageId, emoji = DEFAULT_REACTION_EMOJI } = data || {};
      if (!roomId || !messageId) return;

      const room = await MatchRoom.findById(roomId).lean();
      if (!room || !isParticipant(room, userId)) return;

      const message = await Message.findOne({ _id: messageId, roomId });
      if (!message) return;

      const existingIndex = message.reactions.findIndex(
        (reaction) => reaction.user.toString() === userId
      );

      if (existingIndex >= 0) {
        if (message.reactions[existingIndex].emoji === emoji) {
          message.reactions.splice(existingIndex, 1);
        } else {
          message.reactions[existingIndex].emoji = emoji;
        }
      } else {
        message.reactions.push({
          user: userId,
          emoji,
        });
      }

      await message.save();

      socket.nsp.to(roomId).emit("message_reaction_updated", {
        roomId,
        messageId: message._id.toString(),
        reactions: (message.reactions || []).map((reaction) => ({
          userId: reaction.user.toString(),
          emoji: reaction.emoji || DEFAULT_REACTION_EMOJI,
        })),
      });
    } catch (error) {
      console.error("[toggle_message_reaction] Error:", error);
      socket.emit("error", { message: "Unable to update reaction" });
    }
  });

  // Handle key exchange
  socket.on("init_key_exchange", async (data) => {
    try {
      const { roomId } = data;

      // Generate a consistent key for this match using the matchId
      const sessionKey = crypto
        .createHash("sha256")
        .update(roomId)
        .digest("hex");

      // Store the key temporarily
      keyExchangeService.storeTempKeys(userId, { sessionKey });

      // Send the key to the room
      socket.to(roomId).emit("key_exchange_request", {
        fromUserId: userId,
        sessionKey,
        timestamp: Date.now(),
      });

      // Also send to the sender to ensure they have the key
      socket.emit("key_exchange_request", {
        fromUserId: userId,
        sessionKey,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("[init_key_exchange] Error:", error);
      socket.emit("error", { message: error.message });
    }
  });

  socket.on("key_exchange_response", async (data) => {
    try {
      const { fromUserId, sessionKey, timestamp } = data;

      // Store the received key
      keyExchangeService.storeTempKeys(userId, {
        sessionKey,
        timestamp,
        fromUserId,
      });
    } catch (error) {
      console.error("[key_exchange_response] Error:", error);
      socket.emit("error", { message: error.message });
    }
  });

  // ==================== PROFILE UNLOCK ====================
  socket.on("unlockProfile", async ({ profileId, roomId }) => {
    await unlockProfile(socket, userId, profileId, roomId);
  });

  socket.on("lockProfile", async ({ profileId, roomId }) => {
    await lockProfile(socket, userId, profileId, roomId);
  });

  /* -------- Disconnect -------- */
  socket.on("disconnect", async () => {
    userSockets.delete(userId);

    await User.findByIdAndUpdate(userId, {
      isActive: false,
      socketId: null,
      lastActive: new Date(),
    });
  });
};

/* ============================================================
 * HELPERS
 * ============================================================
 *
 * NOTE:
 * - Pure functions
 * - Safe to move into a shared utils module later
 */

const unlockProfile = async (socket, userId, profileId, roomId) => {
  try {
    if (!profileId || !roomId) {
      throw new Error("Missing profileId or roomId");
    }

    await UnlockHistory.findOneAndUpdate(
      { user: userId, unlockedUser: profileId },
      { unlockedAt: new Date() },
      { upsert: true }
    );

    // send to OTHER user in room
    socket.to(roomId).emit("profileUnlocked", {
      profileId,
      unlockedBy: userId,
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    console.error("[Profile] Unlock error:", err);
    socket.emit("error", { message: err.message });
  }
};
const lockProfile = async (socket, userId, profileId, roomId) => {
  try {
    if (!profileId || !roomId) {
      throw new Error("Missing profileId or roomId");
    }

    await UnlockHistory.deleteOne({
      user: userId,
      unlockedUser: profileId,
    });

    socket.to(roomId).emit("profileLocked", {
      profileId,
      lockedBy: userId,
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    console.error("[Profile] Lock error:", err);
    socket.emit("error", { message: err.message });
  }
};

export default { initialize };





