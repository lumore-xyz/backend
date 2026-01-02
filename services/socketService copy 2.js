import crypto from "crypto";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import Message from "../models/Message.js";
import UnlockHistory from "../models/UnlockHistory.js";
import User from "../models/User.js";
import UserPreference from "../models/UserPreference.js";
import matchingService from "./matchingService.js";

// Shared state
let io = null;
const userSockets = new Map(); // userId -> socket
const userActivity = new Map(); // userId -> { lastSeen, isTyping }
const reconnectionTimers = new Map(); // userId -> timeoutId

// Configuration
const CONFIG = {
  RECONNECTION_GRACE_PERIOD: 60000, // 60 seconds
  MATCHMAKING_TIMEOUT: 300000, // 5 minutes
  MESSAGE_HISTORY_LIMIT: 50,
  TYPING_TIMEOUT: 3000, // 3 seconds
  MAX_MESSAGE_RATE: 10, // messages per minute
};

// Rate limiting
const messageRateLimiter = new Map(); // userId -> { count, resetTime }

const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error("Authentication error: No token provided"));
    }

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const user = await User.findById(decoded.id).select("-password").lean();

    if (!user) {
      return next(new Error("Authentication error: User not found"));
    }

    socket.user = {
      _id: user._id,
      isActive: user.isActive,
      lastActive: user.lastActive,
    };
    next();
  } catch (error) {
    console.error("[Auth] Error:", error);
    next(new Error("Authentication error: Invalid token"));
  }
};

const initialize = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:3000",
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
      credentials: true,
      allowedHeaders: ["*"],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ["websocket", "polling"],
    // Connection recovery
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
      skipMiddlewares: true,
    },
  });

  const chatNamespace = io.of("/api/chat");
  chatNamespace.use(authenticateSocket);

  chatNamespace.on("connection", (socket) => {
    handleConnection(socket);
  });

  // Cleanup stale connections every 5 minutes
  setInterval(() => cleanupStaleConnections(), 300000);
};

/**
 * Find best match with improved algorithm
 */
const findBestMatch = async (userId) => {
  const currentUser = await User.findById(userId);
  const userPreferences = await UserPreference.findOne({ user: userId }).lean();
  const maxDistance = (userPreferences?.distance || 10) * 1000;

  if (!currentUser || !currentUser.hasValidLocation()) {
    return res.status(400).json({
      success: false,
      message: "User not found or location not set",
    });
  }
  const [lng, lat] = currentUser.location.coordinates;

  // Get potential candidates
  const candidates = await User.findNearby(
    lng,
    lat,
    maxDistance,
    {
      isActive: true,
      isMatching: true,
      gender: userPreferences?.interestedIn,
    }, // additional filters
    userId
  );

  console.log(`[Match] Found ${candidates.length} candidates`);

  let bestMatch = null;
  let bestScore = -1;

  for (const candidate of candidates) {
    if (!candidate?.location?.coordinates) continue;

    // Check if already matched (prevent re-matching)
    // const existingMatch = await matchingService.checkExistingMatch(
    //   userId,
    //   candidate._id
    // );
    // if (existingMatch) continue;

    const candidatePreferences = await UserPreference.findOne({
      user: candidate._id,
    }).lean();
    // Check mutual interest
    if (
      !checkMutualInterest(
        userPreferences,
        candidatePreferences,
        currentUser,
        candidate
      )
    ) {
      continue;
    }

    const score = calculateMatchScore(
      userPreferences,
      candidatePreferences,
      candidate
    );
    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        uid: candidate._id.toString(),
        user: candidate,
        preferences: candidatePreferences,
        score: score,
      };
    }
  }

  return bestMatch;
};

/**
 * Check if two users are mutually interested
 */
const checkMutualInterest = (userPrefs, candidatePrefs, user, candidate) => {
  // Check if candidate is interested in user's gender
  if (
    candidatePrefs?.interestedIn &&
    !candidatePrefs.interestedIn.includes(user.gender)
  ) {
    return false;
  }

  // Check age compatibility both ways
  const userAge = getAge(user.dob);
  const candidateAge = getAge(candidate.dob);

  const userAgeMatch =
    candidateAge >= Math.min(...(userPrefs?.ageRange || [])) &&
    candidateAge <= Math.max(...(userPrefs?.ageRange || []));

  const candidateAgeMatch =
    userAge >= Math.min(...(candidatePrefs?.ageRange || [])) &&
    userAge <= Math.max(...(candidatePrefs?.ageRange || []));
  return userAgeMatch && candidateAgeMatch;
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

/**
 * Create match and notify both users
 */
const createAndNotifyMatch = async (userId1, bestMatch) => {
  try {
    const userId2 = bestMatch?.uid;
    const matchScore = bestMatch?.score;
    const { user1: matchedUser1, user2: matchedUser2 } =
      await matchingService.createMatch(userId1, userId2);

    // Use direct peer-to-peer room (sorted IDs for consistency)
    const roomId = [userId1.toString(), userId2.toString()].sort().join("_");
    await User.updateMany(
      { _id: { $in: [userId1, userId2] } },
      {
        $set: {
          activeMatchRoom: roomId,
          matchedUserId: null, // Will be set individually
        },
      }
    );

    await User.findByIdAndUpdate(userId1, { matchedUserId: userId2 });
    await User.findByIdAndUpdate(userId2, { matchedUserId: userId1 });

    const socket1 = userSockets.get(userId1);
    const socket2 = userSockets.get(userId2);

    // Calculate shared interests for icebreaker
    // const user1Prefs = await UserPreference.findById(userId1).lean();
    // const user2Prefs = await UserPreference.findById(userId2).lean();
    // const sharedInterests = intersection(
    //   user1Prefs?.interests?.hobbies || [],
    //   user2Prefs?.interests?.hobbies || []
    // );

    // const matchData1 = {
    //   roomId,
    //   matchedUser: matchedUser2._id,
    //   compatibilityScore: matchScore,
    //   sharedInterests: sharedInterests.slice(0, 3),
    //   icebreaker:
    //     sharedInterests.length > 0
    //       ? `You both love ${sharedInterests[0]}!`
    //       : "Start the conversation!",
    // };

    // const matchData2 = {
    //   roomId,
    //   matchedUser: matchedUser1._id,
    //   compatibilityScore: matchScore,
    //   sharedInterests: sharedInterests.slice(0, 3),
    //   icebreaker:
    //     sharedInterests.length > 0
    //       ? `You both love ${sharedInterests[0]}!`
    //       : "Start the conversation!",
    // };

    if (socket1) {
      socket1.join(roomId);
      socket1.emit("matchFound", { roomId, matchedUser: matchedUser1._id });
    }

    if (socket2) {
      socket2.join(roomId);
      socket2.emit("matchFound", { roomId, matchedUser: matchedUser2._id });
    }
  } catch (error) {
    console.error("[Match] Error:", error);
    await User.updateMany(
      { _id: { $in: [userId1, userId2] } },
      { $set: { isMatching: true, matchmakingTimestamp: Date.now() } }
    );
    throw error;
  }
};

/**
 * Check rate limit for user actions
 */
const checkRateLimit = (userId, action = "message") => {
  const now = Date.now();
  const userLimit = messageRateLimiter.get(userId) || {
    count: 0,
    resetTime: now + 60000,
  };

  if (now > userLimit.resetTime) {
    messageRateLimiter.set(userId, { count: 1, resetTime: now + 60000 });
    return true;
  }

  if (userLimit.count >= CONFIG.MAX_MESSAGE_RATE) {
    return false;
  }

  userLimit.count++;
  messageRateLimiter.set(userId, userLimit);
  return true;
};

const handleConnection = (socket) => {
  const userId = socket.user._id.toString();

  // Clear any reconnection timer
  if (reconnectionTimers.has(userId)) {
    clearTimeout(reconnectionTimers.get(userId));
    reconnectionTimers.delete(userId);
  }

  userSockets.set(userId, socket);
  userActivity.set(userId, { lastSeen: Date.now(), isTyping: false });

  // Update user status
  User.findByIdAndUpdate(
    userId,
    {
      isActive: true,
      socketId: socket.id,
      lastActive: new Date(),
    },
    { new: true }
  )
    .select("-password")
    .lean()
    .then(async (updatedUser) => {
      if (updatedUser) {
        socket.user = {
          _id: updatedUser._id,
          isActive: updatedUser.isActive,
          lastActive: updatedUser.lastActive,
        };

        // Rejoin active match room if exists
        if (updatedUser?.activeMatchRoom) {
          socket.join(updatedUser.activeMatchRoom);

          socket.emit("reconnected", {
            roomId: updatedUser.activeMatchRoom,
            matchedUserId: updatedUser.matchedUserId,
          });

          // Notify partner of reconnection
          socket.to(updatedUser.activeMatchRoom).emit("partnerReconnected", {
            userId: userId,
            timestamp: Date.now(),
          });

          console.log(
            `[Connection] User ${userId} rejoined room ${updatedUser.activeMatchRoom}`
          );
        }
      }
    })
    .catch((error) =>
      console.error("[Connection] Error updating user:", error)
    );

  // ==================== MATCHMAKING ====================

  socket.on("startMatchmaking", async () => {
    try {
      const user = await User.findById(userId).select("-password").lean();

      // if (user.isMatching) {
      //   socket.emit("matchmakingError", {
      //     message: "Already in matchmaking queue",
      //   });
      //   return;
      // }

      // if (user.activeMatchRoom) {
      //   socket.emit("matchmakingError", {
      //     message: "Already in an active match",
      //   });
      //   return;
      // }

      const preferences = await UserPreference.findOne({ user: userId }).lean();

      if (!preferences) {
        socket.emit("matchmakingError", {
          message: "Please complete your preferences first",
        });
        return;
      }

      await User.findByIdAndUpdate(userId, {
        isMatching: true,
        matchmakingTimestamp: Date.now(),
      });

      socket.emit("matchmakingStarted", {
        message: "Looking for your perfect match...",
        timestamp: Date.now(),
      });

      // Set timeout for matchmaking
      const timeoutId = setTimeout(async () => {
        const stillMatching = await User.findById(userId)
          .select("isMatching")
          .lean();
        if (stillMatching?.isMatching) {
          await User.findByIdAndUpdate(userId, {
            isMatching: false,
            matchmakingTimestamp: null,
          });
          socket.emit("matchmakingTimeout", {
            message: "No matches found. Please try again later.",
          });
        }
      }, CONFIG.MATCHMAKING_TIMEOUT);

      // Find best match
      const bestMatch = await findBestMatch(userId);

      if (bestMatch) {
        clearTimeout(timeoutId);
        await createAndNotifyMatch(userId, bestMatch);
      } else {
        // Keep user in queue, they might match with someone who joins later
        socket.emit("matchmakingQueued", {
          message:
            "You're in the queue. We'll notify you when we find a match!",
        });
      }
    } catch (error) {
      console.error("[Matchmaking] Error:", error);
      socket.emit("matchmakingError", { message: error.message });
      await User.findByIdAndUpdate(userId, {
        isMatching: false,
        matchmakingTimestamp: null,
      });
      socket.emit("matchmakingStopped", { message: "Matchmaking stopped" });
    }
  });

  socket.on("stopMatchmaking", async () => {
    await User.findByIdAndUpdate(userId, {
      isMatching: false,
      matchmakingTimestamp: null,
    });
    socket.emit("matchmakingStopped", { message: "Matchmaking stopped" });
  });

  // ==================== CHAT ====================

  socket.on("joinChat", ({ roomId }) => {
    socket.join(roomId);
  });

  /**
   * NEW: Public key exchange for E2E encryption
   * Each user generates their own key pair on the client
   * They exchange public keys via the server
   */
  socket.on("exchangePublicKey", async ({ roomId, publicKey }) => {
    try {
      console.log(
        `[Crypto] User ${userId} sharing public key in room ${roomId}`
      );

      // Verify user is in the room
      if (!socket.rooms.has(roomId)) {
        socket.emit("error", { message: "Not in the specified room" });
        return;
      }

      // Broadcast public key to the other user in the room
      socket.to(roomId).emit("partnerPublicKey", {
        userId: userId,
        publicKey: publicKey,
        timestamp: Date.now(),
      });

      // Acknowledge receipt
      socket.emit("publicKeyShared", {
        message: "Public key shared successfully",
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("[Crypto] Error exchanging public key:", error);
      socket.emit("error", { message: error.message });
    }
  });

  socket.on("send_message", async (data) => {
    try {
      const { roomId, encryptedContent, receiverId, replyToId } = data;

      // Rate limiting
      if (!checkRateLimit(userId)) {
        socket.emit("error", {
          message: "Rate limit exceeded. Please slow down.",
        });
        return;
      }

      // Verify user is in room
      if (!socket.rooms.has(roomId)) {
        socket.emit("error", { message: "Not in the correct chat room" });
        return;
      }

      if (!receiverId) {
        socket.emit("error", { message: "Receiver ID is required" });
        return;
      }

      const messageId = crypto.randomBytes(16).toString("hex");
      const timestamp = Date.now();

      // Broadcast to room (receiver)
      socket.to(roomId).emit("new_message", {
        messageId,
        senderId: userId,
        receiverId,
        replyToId,
        encryptedContent, // Client encrypted with receiver's public key
        timestamp,
      });

      // Store in database (encrypted)
      const message = await Message.create({
        _id: messageId,
        sender: userId,
        receiver: receiverId,
        replyTo: replyToId,
        roomId: roomId,
        encryptedData: encryptedContent,
        createdAt: timestamp,
      });

      // Confirm to sender
      socket.emit("message_sent", {
        messageId,
        timestamp,
        status: "delivered",
      });

      // Update user activity
      userActivity.set(userId, { lastSeen: Date.now(), isTyping: false });

      console.log(`[Message] Sent in room ${roomId}`);
    } catch (error) {
      console.error("[Message] Error:", error);
      socket.emit("error", { message: error.message });
    }
  });

  // ==================== TYPING INDICATOR ====================

  socket.on("typing", ({ roomId, isTyping }) => {
    if (!socket.rooms.has(roomId)) return;

    const activity = userActivity.get(userId) || {};
    activity.isTyping = isTyping;
    activity.lastSeen = Date.now();
    userActivity.set(userId, activity);

    socket.to(roomId).emit("partnerTyping", {
      userId,
      isTyping,
      timestamp: Date.now(),
    });

    // Auto-clear typing after timeout
    if (isTyping) {
      setTimeout(() => {
        const currentActivity = userActivity.get(userId);
        if (currentActivity?.isTyping) {
          currentActivity.isTyping = false;
          userActivity.set(userId, currentActivity);
          socket.to(roomId).emit("partnerTyping", {
            userId,
            isTyping: false,
            timestamp: Date.now(),
          });
        }
      }, CONFIG.TYPING_TIMEOUT);
    }
  });

  // ==================== MESSAGE REACTIONS ====================

  socket.on("like_message", async (data) => {
    try {
      const { messageId, roomId } = data;

      if (!messageId) {
        socket.emit("error", { message: "Message ID is required" });
        return;
      }

      const updatedMessage = await Message.findByIdAndUpdate(
        messageId,
        { $addToSet: { likedBy: userId } },
        { new: true }
      );

      if (!updatedMessage) {
        socket.emit("error", { message: "Message not found" });
        return;
      }

      // Notify both users
      io.of("/api/chat").to(roomId).emit("message_liked", {
        messageId: updatedMessage._id,
        likedBy: userId,
        totalLikes: updatedMessage.likedBy.length,
        timestamp: Date.now(),
      });

      console.log(`[Message] Liked message ${messageId}`);
    } catch (error) {
      console.error("[Message] Error liking:", error);
      socket.emit("error", { message: error.message });
    }
  });

  socket.on("unlike_message", async (data) => {
    try {
      const { messageId, roomId } = data;

      const updatedMessage = await Message.findByIdAndUpdate(
        messageId,
        { $pull: { likedBy: userId } },
        { new: true }
      );

      if (!updatedMessage) {
        socket.emit("error", { message: "Message not found" });
        return;
      }

      io.of("/api/chat").to(roomId).emit("message_unliked", {
        messageId: updatedMessage._id,
        unlikedBy: userId,
        totalLikes: updatedMessage.likedBy.length,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("[Message] Error unliking:", error);
      socket.emit("error", { message: error.message });
    }
  });

  // ==================== MESSAGE READ RECEIPTS ====================

  socket.on("markAsRead", async ({ messageIds, roomId }) => {
    try {
      if (!Array.isArray(messageIds) || messageIds.length === 0) return;

      await Message.updateMany(
        {
          _id: { $in: messageIds },
          receiver: userId,
          roomId: roomId,
        },
        {
          $set: {
            readAt: new Date(),
            status: "read",
          },
        }
      );

      // Notify sender
      socket.to(roomId).emit("messagesRead", {
        messageIds,
        readBy: userId,
        timestamp: Date.now(),
      });

      console.log(`[Message] Marked ${messageIds.length} messages as read`);
    } catch (error) {
      console.error("[Message] Error marking as read:", error);
    }
  });

  // ==================== PROFILE UNLOCK ====================

  socket.on("unlockProfile", async ({ profileId, roomId }) => {
    await unlockProfile(socket, userId, profileId, roomId);
  });

  socket.on("lockProfile", async ({ profileId, roomId }) => {
    await lockProfile(socket, userId, profileId, roomId);
  });

  // ==================== CHAT CANCELLATION ====================

  socket.on("cancelChat", async ({ roomId }) => {
    console.log("CANCEL REQUEST RECEIVED for room:", roomId);

    // ✅ Emit BEFORE leaving/disconnecting.
    // console.log("CHAT CANCEL EMIT -> room:", roomId);
    // console.log(socket.rooms);

    socket.to(roomId).emit("chatCancelled", {
      roomId,
    });

    // ✅ Now leave the room
    socket.leave(roomId);
    console.log(`Socket ${socket.id} left room ${roomId}`);
  });

  // ==================== DISCONNECT ====================

  socket.on("disconnect", async () => {
    console.log(`[Disconnect] User ${userId} disconnected`);

    try {
      const user = await User.findById(userId)
        .select("-password activeMatchRoom matchedUserId")
        .lean();

      if (!user) return;

      // Set reconnection grace period
      const timerId = setTimeout(async () => {
        console.log(`[Disconnect] Grace period expired for user ${userId}`);

        // Check if still disconnected
        if (!userSockets.has(userId)) {
          await User.findByIdAndUpdate(userId, {
            isMatching: false,
            matchmakingTimestamp: null,
            socketId: null,
            isActive: false,
            lastActive: new Date(),
          });

          // Notify partner
          if (user.activeMatchRoom) {
            io.of("/api/chat")
              .to(user.activeMatchRoom)
              .emit("partnerDisconnected", {
                userId: userId,
                timestamp: Date.now(),
              });
          }

          userSockets.delete(userId);
          userActivity.delete(userId);
          messageRateLimiter.delete(userId);
          reconnectionTimers.delete(userId);
        }
      }, CONFIG.RECONNECTION_GRACE_PERIOD);

      reconnectionTimers.set(userId, timerId);

      // Immediate notification (they might reconnect soon)
      if (user.activeMatchRoom) {
        socket.to(user.activeMatchRoom).emit("partnerDisconnectedTemporary", {
          userId: userId,
          reconnectWindow: CONFIG.RECONNECTION_GRACE_PERIOD,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      console.error("[Disconnect] Error:", error);
    }
  });
};

// ==================== HELPER FUNCTIONS ====================

const unlockProfile = async (socket, userId, profileId, roomId) => {
  try {
    const user = await User.findById(userId);
    const profile = await User.findById(profileId);

    if (!user) throw new Error("User not found");
    if (!profile) throw new Error("Profile not found");

    await UnlockHistory.create({
      user: userId,
      unlockedUser: profileId,
      unlockedAt: new Date(),
    });

    io.of("/api/chat")
      .to(roomId)
      .emit("profileUnlocked", {
        profileId,
        unlockedBy: userId,
        profileData: {
          name: profile.name,
          bio: profile.bio,
          photos: profile.photos,
        },
        timestamp: new Date().toISOString(),
      });

    console.log(`[Profile] User ${userId} unlocked profile ${profileId}`);
  } catch (error) {
    console.error("[Profile] Error unlocking:", error);
    socket.emit("error", { message: error.message });
  }
};

const lockProfile = async (socket, userId, profileId, roomId) => {
  try {
    await UnlockHistory.deleteOne({
      user: userId,
      unlockedUser: profileId,
    });

    io.of("/api/chat").to(roomId).emit("profileLocked", {
      profileId,
      lockedBy: userId,
      timestamp: new Date().toISOString(),
    });

    console.log(`[Profile] User ${userId} locked profile ${profileId}`);
  } catch (error) {
    console.error("[Profile] Error locking:", error);
    socket.emit("error", { message: error.message });
  }
};

/**
 * Cleanup stale connections and inactive users
 */
const cleanupStaleConnections = async () => {
  console.log("[Cleanup] Starting cleanup of stale connections");

  const now = Date.now();
  const staleThreshold = 10 * 60 * 1000; // 10 minutes

  for (const [userId, activity] of userActivity.entries()) {
    if (now - activity.lastSeen > staleThreshold) {
      const socket = userSockets.get(userId);
      if (socket) {
        socket.disconnect(true);
      }
      userSockets.delete(userId);
      userActivity.delete(userId);
      messageRateLimiter.delete(userId);
      console.log(`[Cleanup] Removed stale connection for user ${userId}`);
    }
  }
};

// Utility functions
function getAge(dob) {
  if (!dob) return 0;
  const today = new Date();
  const birthDate = new Date(dob);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }
  return age;
}

function hasOverlap(array, value) {
  if (!Array.isArray(array)) return false;
  return array.includes(value);
}

function intersection(a = [], b = []) {
  return a.filter((item) => b.includes(item));
}

export default {
  initialize,
  handleConnection,
  createAndNotifyMatch,
  userSockets, // Export for testing
  userActivity, // Export for monitoring
};
