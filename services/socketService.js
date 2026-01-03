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
import MatchRoom from "../models/MatchRoom.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import UserPreference from "../models/UserPreference.js";
import { keyExchangeService } from "./keyExchangeService.js";
import { getOrCreateMatchRoom } from "./matchingService.js";
import { sendNotificationToUser } from "./pushService.js";

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
const findBestMatch = async (userId, userPrefs) => {
  const currentUser = await User.findById(userId).lean();
  if (!currentUser?.location?.coordinates) return null;

  const [lng, lat] = currentUser.location.coordinates;
  const maxDistance = (userPrefs?.distance || 10) * 1000;

  const candidates = await User.findNearby(
    lng,
    lat,
    maxDistance,
    {
      isMatching: true,
      dailyConversations: { $gt: 0 },
    },
    userId
  );

  if (!candidates.length) return null;

  const prefs = await UserPreference.find({
    user: { $in: candidates.map((c) => c._id) },
  }).lean();

  const prefMap = new Map(prefs.map((p) => [p.user.toString(), p]));

  let bestStrict = null;
  let bestStrictScore = -1;

  let bestFallback = null;
  let bestFallbackScore = -1;

  const safeUserPrefs = normalizePrefs(userPrefs || {});

  for (const candidate of candidates) {
    const candidatePrefs = prefMap.get(candidate._id.toString()) || {};

    const safeCandidatePrefs = normalizePrefs(candidatePrefs);

    const score = calculateMatchScore(
      safeUserPrefs,
      safeCandidatePrefs,
      candidate
    );

    // Allow zero-score matches ONLY if prefs are missing
    const isStrict = checkMutualInterest(
      safeUserPrefs,
      safeCandidatePrefs,
      currentUser,
      candidate
    );

    if (isStrict && score > bestStrictScore) {
      bestStrictScore = score;
      bestStrict = {
        uid: candidate._id.toString(),
        user: candidate,
        mode: "STRICT",
      };
    }

    if (score > bestFallbackScore) {
      bestFallbackScore = score;
      bestFallback = {
        uid: candidate._id.toString(),
        user: candidate,
        mode: "FALLBACK",
      };
    }
  }

  // 🧊 COLD START GUARANTEE
  if (!bestStrict && !bestFallback) {
    const first = candidates[0];
    return {
      uid: first._id.toString(),
      user: first,
      mode: "COLD_START",
    };
  }

  return bestStrict || bestFallback;
};

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
const createAndNotifyMatch = async (userId1, userId2) => {
  const room = await getOrCreateMatchRoom(userId1, userId2);
  await User.updateMany(
    { _id: { $in: [userId1, userId2] } },
    {
      $set: {
        isMatching: false,
      },
      $inc: {
        dailyConversations: -1,
      },
    }
  );

  const roomId = room._id.toString();

  const s1 = userSockets.get(userId1);
  const s2 = userSockets.get(userId2);

  if (s1) {
    s1.join(roomId);
    s1.emit("matchFound", {
      roomId,
      matchedUserId: userId2,
    });
    sendNotificationToUser(userId1, { title: "Match found!", body: "💙" });
  }

  if (s2) {
    s2.join(roomId);
    s2.emit("matchFound", {
      roomId,
      matchedUserId: userId1,
    });
    sendNotificationToUser(userId2, { title: "Match found!", body: "💙" });
  }
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

  // Fire-and-forget presence update
  User.findByIdAndUpdate(userId, {
    isActive: true,
    socketId: socket.id,
    lastActive: new Date(),
  }).lean();

  /* -------- Matchmaking -------- */
  socket.on("startMatchmaking", async () => {
    try {
      const prefs = await UserPreference.findOne({ user: userId }).lean();
      await User.findByIdAndUpdate(userId, {
        isMatching: true,
        matchmakingTimestamp: Date.now(),
      });

      const match = await findBestMatch(userId, prefs);
      console.log("match", match);
      if (match) await createAndNotifyMatch(userId, match.uid);
    } catch (e) {
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
  socket.on("joinChat", ({ matchId }) => socket.join(matchId));
  socket.on("endChat", async ({ roomId }) => {
    const room = await MatchRoom.findById(roomId);
    if (!room) return;

    if (!room.participants.includes(userId)) return;

    room.status = "ended";
    room.endedBy = userId;
    await room.save();

    socket.to(roomId).emit("chatEnded", {
      endedBy: userId,
    });
  });

  socket.on("send_message", async (data) => {
    const { roomId, encryptedContent, iv, receiverId } = data;

    const room = await MatchRoom.findById(roomId).lean();
    if (!room) return;

    // Must be participant
    if (!room.participants.some((id) => id.toString() === userId)) return;

    // Must be active
    if (room.status !== "active") return;

    socket.to(roomId).emit("new_message", {
      senderId: userId,
      encryptedData: encryptedContent,
      iv,
      timestamp: Date.now(),
    });

    await Message.create({
      sender: userId,
      receiver: receiverId,
      roomId,
      encryptedData: encryptedContent,
      iv,
    });

    await MatchRoom.findByIdAndUpdate(roomId, {
      lastMessageAt: new Date(),
    });
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

function getAge(dob) {
  if (!dob) return 0;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / 31557600000);
}
function hasOverlap(array, value) {
  if (!Array.isArray(array)) return false;
  return array.includes(value);
}
function intersection(a = [], b = []) {
  return a.filter((x) => b.includes(x));
}
const checkMutualInterest = (userPrefs, candidatePrefs, user, candidate) => {
  if (
    candidatePrefs.interestedIn.length &&
    !candidatePrefs.interestedIn.includes(user.gender)
  ) {
    return false;
  }

  if (!userPrefs.ageRange || !candidatePrefs.ageRange) return false;

  const userAge = getAge(user.dob);
  const candidateAge = getAge(candidate.dob);

  return (
    candidateAge >= userPrefs.ageRange.min &&
    candidateAge <= userPrefs.ageRange.max &&
    userAge >= candidatePrefs.ageRange.min &&
    userAge <= candidatePrefs.ageRange.max
  );
};
const calculateMatchScore = (userPrefs, candidatePrefs, candidateUser) => {
  let score = 0;

  // 1. Gender match (15 points)
  if (userPrefs?.interestedIn?.includes(candidateUser.gender)) {
    score += 15;
  }

  // 2. Age range match (15 points)
  const age = getAge(candidateUser?.dob);
  if (age >= userPrefs?.ageRange?.min && age <= userPrefs?.ageRange?.max) {
    score += 15;
  }

  // 3. Goals match (up to 30 points)
  const userGoals = [
    userPrefs?.goal?.primary,
    userPrefs?.goal?.secondary,
    userPrefs?.goal?.tertiary,
  ].filter(Boolean);

  const candidateGoals = [
    candidatePrefs?.goal?.primary,
    candidatePrefs?.goal?.secondary,
    candidatePrefs?.goal?.tertiary,
  ].filter(Boolean);

  const goalOverlap = userGoals.filter((goal) => candidateGoals.includes(goal));
  score += goalOverlap.length * 10;

  // 4. Interests match (up to 15 points)
  const sharedHobbies = intersection(
    userPrefs?.interests?.hobbies || [],
    candidatePrefs?.interests?.hobbies || []
  );
  const sharedProfessional = intersection(
    userPrefs?.interests?.professional || [],
    candidatePrefs?.interests?.professional || []
  );

  score += Math.min((sharedHobbies.length + sharedProfessional.length) * 2, 15);

  // 5. Diet match (5 points)
  if (
    hasOverlap(userPrefs?.dietPreference, candidateUser?.diet) ||
    hasOverlap(userPrefs?.dietPreference, ["Any"])
  ) {
    score += 5;
  }

  // 6. Zodiac match (5 points)
  if (
    hasOverlap(userPrefs?.zodiacPreference, candidateUser.zodiacSign) ||
    hasOverlap(userPrefs?.zodiacPreference, ["Any"])
  ) {
    score += 5;
  }

  // 7. Personality type match (5 points)
  if (
    hasOverlap(
      userPrefs?.personalityTypePreference,
      candidateUser?.personalityType
    ) ||
    hasOverlap(userPrefs?.personalityTypePreference, ["Any"])
  ) {
    score += 5;
  }

  // 8. Language match (5 points)
  if (
    intersection(
      userPrefs?.preferredLanguages || [],
      candidateUser?.languages || []
    ).length > 0
  ) {
    score += 5;
  }

  // 9. Relationship type match (10 points)
  if (
    userPrefs?.relationshipType &&
    candidatePrefs?.relationshipType &&
    userPrefs?.relationshipType === candidatePrefs?.relationshipType
  ) {
    score += 10;
  }

  return score;
};
const normalizePrefs = (prefs) => ({
  ...prefs,
  interestedIn: Array.isArray(prefs?.interestedIn)
    ? prefs.interestedIn
    : prefs?.interestedIn
    ? [prefs.interestedIn]
    : [],
  ageRange: Array.isArray(prefs?.ageRange)
    ? { min: prefs.ageRange[0], max: prefs.ageRange[1] }
    : prefs?.ageRange || null,
});
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

    console.log(`[Profile] ${userId} unlocked ${profileId}`);
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

    console.log(`[Profile] ${userId} locked ${profileId}`);
  } catch (err) {
    console.error("[Profile] Lock error:", err);
    socket.emit("error", { message: err.message });
  }
};

export default { initialize };
