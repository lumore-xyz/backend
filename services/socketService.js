import crypto from "crypto";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import Message from "../models/Message.js";
import Slot from "../models/Slot.js";
import UnlockHistory from "../models/UnlockHistory.js";
import User from "../models/User.js";
import UserPreference from "../models/UserPreference.js";
import { keyExchangeService } from "./keyExchangeService.js";
import { isWithinDistance } from "./locationService.js";
import matchingService from "./matchingService.js";

// Shared state
let io = null;
const userSockets = new Map(); // userId -> socket

const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error("Authentication error: No token provided"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password").lean(); // Use lean() to get a plain JavaScript object

    if (!user) {
      return next(new Error("Authentication error: User not found"));
    }

    // Attach user to socket with all necessary fields
    socket.user = {
      _id: user._id,
      isActive: user.isActive,
      lastActive: user.lastActive,
    };

    console.log("[authenticateSocket] Authenticated user:", socket.user);
    next();
  } catch (error) {
    console.error("Socket Authentication Error:", error);
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
  });

  const chatNamespace = io.of("/api/chat");

  // Apply authentication middleware
  chatNamespace.use(authenticateSocket);

  chatNamespace.on("connection", (socket) => {
    console.log("New client connected:", socket.id);
    handleConnection(socket);
  });
};

/**
 * Finds the best matching user for the given user based on preferences and proximity.
 *
 * Dev Notes:
 * - We use the MongoDB aggregation pipeline with $geoNear to first fetch nearby users.
 * - Only users marked as matching (isMatching: true) and with valid location data are returned.
 * - The query excludes the current user.
 * - We limit the number of potential matches (e.g., 100) for performance.
 * - For each candidate, we load their preferences and then calculate a match score.
 * - The match with the highest score is selected as the best match.
 * - Instead of using an in-memory userSocket mapping, we retrieve the matched user’s active socket from their stored socketId.
 * - Make sure the User model has a 2dsphere index on the location field.
 *
 * @param userId - ID of the current user who is looking for a match.
 * @param userPreferences - Preferences of the current user.
 * @returns The best match object containing the user data, preferences, and socket (if available), or null if none found.
 */
const findBestMatch = async (userId, userPreferences) => {
  const currentUser = await User.findById(userId).lean();
  if (!currentUser?.location?.coordinates) {
    console.log(`[findBestMatch] User ${userId} has no location data`);
    return null;
  }

  // Get all potential candidates that meet base filters
  const candidates = await User.find({
    isMatching: true,
    isActive: true,
    _id: { $ne: userId },
    // gender:  // use current user prefered gender and check in candidates
  }).lean();

  console.log(`[findBestMatch] Found ${candidates.length} potential matches`);

  let bestMatch = null;
  let bestScore = -1;

  for (const candidate of candidates) {
    if (!candidate?.location?.coordinates) continue;

    const isCloseEnough = isWithinDistance(
      currentUser.location,
      candidate.location,
      userPreferences?.distance || 10 * 1000 // default to 10km
    );

    console.log(
      `[findBestMatch] Checking candidate ${candidate._id} - Close enough: ${isCloseEnough}`
    );

    if (!isCloseEnough) {
      continue;
    }

    const candidatePreferences = await UserPreference.findOne({
      user: candidate._id,
    }).lean();

    // if (!candidatePreferences) continue;

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
        socket: candidate.socketId,
      };
    }
  }

  if (bestMatch) {
    console.log(
      `[findBestMatch] Best match found for user ${userId} with score ${bestScore}`
    );
  } else {
    console.log(
      `[findBestMatch] No compatible matches found for user ${userId}`
    );
  }

  return bestMatch;
};

const calculateMatchScore = (userPrefs, candidatePrefs, candidateUser) => {
  let score = 0;

  // 1. Gender match
  if (
    userPrefs?.interestedIn &&
    candidateUser?.gender &&
    userPrefs?.interestedIn?.includes(candidateUser.gender)
  ) {
    score += 15;
  }

  // 2. Age range match
  const age = getAge(candidateUser?.dob);
  if (age >= userPrefs?.ageRange.min && age <= userPrefs?.ageRange.max) {
    score += 15;
  }

  // 3. Goals match
  const userGoals = [
    userPrefs?.goal?.primary,
    userPrefs?.goal?.secondary,
    userPrefs?.goal?.tertiary,
  ]?.filter(Boolean);

  const candidateGoals = [
    candidatePrefs?.goal?.primary,
    candidatePrefs?.goal?.secondary,
    candidatePrefs?.goal?.tertiary,
  ]?.filter(Boolean);

  const goalOverlap = userGoals.filter((goal) => candidateGoals.includes(goal));

  score += goalOverlap?.length * 10;

  // 4. Interests match
  const sharedHobbies = intersection(
    userPrefs?.interests?.hobbies || [],
    candidatePrefs?.interests?.hobbies || []
  );
  const sharedProfessional = intersection(
    userPrefs?.interests?.professional || [],
    candidatePrefs?.interests?.professional || []
  );

  score += Math.min(sharedHobbies.length + sharedProfessional.length, 10); // cap at 10 pts

  // 5. Diet match
  if (
    hasOverlap(userPrefs?.dietPreference, candidateUser?.diet) ||
    hasOverlap(userPrefs?.dietPreference, ["Any"])
  ) {
    score += 5;
  }

  // 6. Zodiac match
  if (
    hasOverlap(userPrefs?.zodiacPreference, candidateUser.zodiacSign) ||
    hasOverlap(userPrefs?.zodiacPreference, ["Any"])
  ) {
    score += 5;
  }

  // 7. Personality type match
  if (
    hasOverlap(
      userPrefs?.personalityTypePreference,
      candidateUser?.personalityType
    ) ||
    hasOverlap(userPrefs?.personalityTypePreference, ["Any"])
  ) {
    score += 5;
  }

  // 8. Language match
  if (
    intersection(
      userPrefs?.preferredLanguages || [],
      candidateUser?.languages || []
    ).length > 0
  ) {
    score += 5;
  }

  // 9. Relationship type match
  if (
    userPrefs?.relationshipType &&
    candidatePrefs?.relationshipType &&
    userPrefs?.relationshipType === candidatePrefs?.relationshipType
  ) {
    score += 10;
  }

  return score;
};

const createAndNotifyMatch = async (userId1, userId2) => {
  try {
    // Create match in database
    const { user1: matchedUser1, user2: matchedUser2 } =
      await matchingService.createMatch(userId1.toString(), userId2.toString());
    const matchId = `match_${userId1.toString()}_${userId2.toString()}`;

    await User.updateMany(
      { _id: { $in: [userId1, userId2] } },
      { $set: { activeMatchRoom: matchId } }
    );

    const socket1 = userSockets.get(userId1.toString());
    const socket2 = userSockets.get(userId2.toString());

    // Join both users to the match room
    socket1.join(matchId);
    socket1.emit("matchFound", { matchId, matchedUser: matchedUser2?._id });
    if (socket2) {
      socket2.join(matchId);
      socket2.emit("matchFound", { matchId, matchedUser: matchedUser1?._id });
    }

    // Notify both users
  } catch (error) {
    await User.updateMany(
      { _id: { $in: [userId1, userId2] } },
      { $set: { isMatching: true, matchmakingTimestamp: Date.now() } }
    );

    throw error;
  }
};

const handleConnection = (socket) => {
  // Store user connection
  const userId = socket.user._id.toString();
  console.log("[handleConnection] New socket connection for user:", userId);
  userSockets.set(userId, socket);

  // Update user's active status and refresh socket.user object
  User.findByIdAndUpdate(
    userId,
    {
      isActive: true,
      socketId: socket.id, // Store socket ID in user document
      lastActive: new Date(),
    },
    { new: true }
  )
    .select("-password")
    .lean()
    .then((updatedUser) => {
      if (updatedUser) {
        // Update socket.user with fresh data
        socket.user = {
          _id: updatedUser._id,
          isActive: updatedUser.isActive,
          lastActive: updatedUser.lastActive,
        };
        console.log("[handleConnection] Updated socket.user:", socket.user);
      }
      if (updatedUser?.activeMatchRoom) {
        console.log("user?.activeMatchRoom", updatedUser?.activeMatchRoom);
        socket.join(updatedUser.activeMatchRoom);
        socket.emit("matchFound", {
          matchId: updatedUser?.activeMatchRoom,
          matchedUser: updatedUser?.matchchedUserId,
        });
        console.log(
          `[handleConnection] User ${userId} joined room ${updatedUser.activeMatchRoom}`
        );
      }
    })
    .catch((error) => console.error("Error updating user status:", error));

  // Handle matchmaking
  socket.on("startMatchmaking", async () => {
    try {
      const user = await User.findById(userId).select("-password").lean();
      console.log("[startMatchmaking] User");
      // if (matchmakingUsers.has(userId)) return;
      // if (user.isMatching) return;

      // Fetch user preferences
      const preferences = await UserPreference.findOne({ user: userId }).lean();
      console.log("[startMatchmaking] preferences");

      await User.findByIdAndUpdate(userId, {
        isMatching: true,
        matchmakingTimestamp: Date.now(),
      });
      console.log("[startMatchmaking] User added to matchmaking pool");
      // Find best match
      const bestMatch = await findBestMatch(userId, preferences);
      console.log("[startMatchmaking] bestMatch", bestMatch);
      if (bestMatch) {
        await createAndNotifyMatch(userId, bestMatch.uid);
      }
    } catch (error) {
      socket.emit("matchmakingError", { message: error.message });
    }
  });

  socket.on("stopMatchmaking", async () => {
    await User.findByIdAndUpdate(userId, {
      isMatching: false,
      matchmakingTimestamp: null,
    });
  });

  // Handle joining chat room
  socket.on("joinChat", ({ matchId }) => {
    console.log(`[joinChat] User ${userId} joined room ${matchId}`);
    socket.join(matchId);
  });

  // Handle key exchange
  socket.on("init_key_exchange", async (data) => {
    try {
      const { matchId } = data;
      console.log(
        `[init_key_exchange] User ${userId} initiated key exchange in room ${matchId}`
      );

      // Generate a consistent key for this match using the matchId
      const sessionKey = crypto
        .createHash("sha256")
        .update(matchId)
        .digest("hex");
      console.log(
        `[init_key_exchange] Generated session key for match ${matchId}`
      );

      // Store the key temporarily
      keyExchangeService.storeTempKeys(userId, { sessionKey });
      console.log(`[init_key_exchange] Stored session key for user ${userId}`);

      // Send the key to the room
      console.log(
        `[init_key_exchange] Broadcasting key exchange request to room ${matchId}`
      );
      socket.to(matchId).emit("key_exchange_request", {
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
      console.log(
        `[key_exchange_response] User ${userId} received key from ${fromUserId}`
      );

      // Store the received key
      keyExchangeService.storeTempKeys(userId, {
        sessionKey,
        timestamp,
        fromUserId,
      });
      console.log(`[key_exchange_response] Stored key from user ${fromUserId}`);
    } catch (error) {
      console.error("[key_exchange_response] Error:", error);
      socket.emit("error", { message: error.message });
    }
  });

  // Handle new message
  socket.on("send_message", async (data) => {
    try {
      const { matchId, encryptedContent, iv, receiverId, originalMessageId } =
        data;

      // Verify the user is in the correct room
      if (!socket.rooms.has(matchId)) {
        socket.emit("error", { message: "Not in the correct chat room" });
        return;
      }

      // Verify receiver exists
      if (!receiverId) {
        socket.emit("error", { message: "Receiver ID is required" });
        return;
      }

      // Broadcast the message to the room
      socket.to(matchId).emit("new_message", {
        senderId: userId,
        receiverId,
        originalMessageId,
        encryptedData: encryptedContent,
        iv: iv,
        timestamp: Date.now(),
      });

      // Store the message in the database
      const message = await Message.create({
        sender: userId,
        receiver: receiverId,
        replyTo: originalMessageId,
        roomId: matchId,
        encryptedData: encryptedContent,
        iv: iv,
      });

      console.log("[send_message] Message created:", message);

      // Confirm message sent
      socket.emit("message_sent", {
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("[send_message] Error:", error);
      socket.emit("error", { message: error.message });
    }
  });

  socket.on("like_message", async (data) => {
    try {
      const { messageId } = data;
      const userId = socket.userId; // Assume userId is set when socket connects via auth

      if (!messageId) {
        socket.emit("error", { message: "Message ID is required to like" });
        return;
      }

      // Add the like (prevent duplicates with $addToSet)
      const updatedMessage = await Message.findByIdAndUpdate(
        messageId,
        { $addToSet: { likedBy: userId } },
        { new: true }
      );

      // Notify the room or sender that the message was liked
      socket.to(updatedMessage.roomId).emit("message_liked", {
        messageId: updatedMessage._id,
        likedBy: userId,
        totalLikes: updatedMessage.likedBy.length,
      });

      socket.emit("like_success", {
        messageId: updatedMessage._id,
        totalLikes: updatedMessage.likedBy.length,
      });
    } catch (error) {
      console.error("[like_message] Error:", error);
      socket.emit("error", { message: error.message });
    }
  });

  // Handle profile unlock request
  socket.on("unlockProfile", async ({ profileId, userId, matchId }) => {
    unlockProfile(socket, userId, profileId, matchId);
  });

  // Handle profile lock request
  socket.on("lockProfile", async ({ profileId, userId, matchId }) => {
    lockProfile(socket, userId, profileId, matchId);
  });

  // Handle chat cancellation
  socket.on("cancelChat", async () => {
    console.log("[cancelChat] Received cancel chat request");
    const userId = socket.user._id.toString();
    try {
      // Check if the user is in a match
      const user = await User.findById(userId).select("-password").lean();
      if (!user || !user.activeMatchRoom) {
        socket.emit("error", { message: "User not in a match" });
        return;
      }
      const matchId = user.activeMatchRoom;
      console.log("[cancelChat] User is in match:", matchId);
      const inUserSlot = await Slot.findOne({
        user: userId,
        roomId: matchId,
      }).lean();
      const inPartnerSlot = await Slot.findOne({
        user: user?.matchchedUserId,
        roomId: matchId,
      }).lean();

      console.log("[inUserSlot]", inUserSlot);
      console.log("[inPartnerSlot]", inPartnerSlot);

      if (inUserSlot) {
        await Slot.findOneAndDelete({
          user: userId,
          roomId: matchId,
        });
      }
      if (inPartnerSlot) {
        await Slot.findOneAndDelete({
          user: user?.matchchedUserId,
          roomId: matchId,
        });
      }

      // Notify the other user in the match
      await User.findByIdAndUpdate(user.matchchedUserId, {
        isMatching: false,
        matchmakingTimestamp: Date.now(),
        activeMatchRoom: null,
        matchchedUserId: null,
      });
      await User.findByIdAndUpdate(userId, {
        isMatching: false,
        matchmakingTimestamp: Date.now(),
        activeMatchRoom: null,
        matchchedUserId: null,
      });

      // Notify the room
      socket.to(matchId).emit("chatCancelled", { matchId });

      // Leave the chat room
      socket.leave(matchId);

      console.log(`[cancelChat] User ${userId} left room ${matchId}`);
    } catch (error) {
      console.error("[cancelChat] Error:", error);
      socket.emit("error", { message: error.message });
    }
  });

  // Handle disconnection
  socket.on("disconnect", async () => {
    console.log("[disconnect] Socket disconnected for user:", userId);

    if (userId) {
      try {
        const user = await User.findById(userId).select("-password").lean();
        if (!user) {
          console.log("[disconnect] User not found:", userId);
          return;
        }

        socket.to(user.activeMatchRoom).emit("userDisconnected");

        userSockets.delete(userId);
        // matchmakingUsers.delete(userId);
        await User.findByIdAndUpdate(userId, {
          isMatching: false,
          matchmakingTimestamp: null,
          socketId: null,
          isActive: false,
          // matchchedUserId: null,
          // activeMatchRoom: null,
          lastActive: new Date(),
        });
      } catch (error) {
        console.error("Error handling disconnection:", error);
      }
    }
  });
};

const unlockProfile = async (socket, userId, profileId, matchId) => {
  try {
    const user = await User.findById(userId);
    const profile = await User.findById(profileId);

    if (!user) throw new Error("User not found");
    if (!profile) throw new Error("Profile not found");

    // Create unlock history with correct schema
    await UnlockHistory.create({
      user: userId,
      unlockedUser: profileId,
      unlockedAt: new Date(),
    });

    // Emit event to the match room
    socket.to(matchId).emit("profileUnlocked", {
      profileId,
      unlockedBy: userId,
      timestamp: new Date().toISOString(),
    });

    // Also emit to the sender
    socket.emit("profileUnlocked", {
      profileId,
      unlockedBy: userId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[unlockProfile] Error:", error);
    socket.emit("error", { message: error.message });
  }
};

const lockProfile = async (socket, userId, profileId, matchId) => {
  try {
    // Delete unlock history with correct schema
    await UnlockHistory.deleteOne({
      user: userId,
      unlockedUser: profileId,
    });

    // Emit event to the match room
    socket.to(matchId).emit("profileLocked", {
      profileId,
      lockedBy: userId,
      timestamp: new Date().toISOString(),
    });

    // Also emit to the sender
    socket.emit("profileLocked", {
      profileId,
      lockedBy: userId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[lockProfile] Error:", error);
    socket.emit("error", { message: error.message });
  }
};

export default {
  initialize,
  handleConnection,
  createAndNotifyMatch,
};

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
