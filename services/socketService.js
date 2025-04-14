import crypto from "crypto";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";

import Message from "../models/Message.js";
import UnlockHistory from "../models/UnlockHistory.js";
import User from "../models/User.js";
import UserPreference from "../models/UserPreference.js";
import { calculateAge, isAgeInRange } from "./ageService.js";
import { encryptionService } from "./encryptionService.js";
import { keyExchangeService } from "./keyExchangeService.js";
import { isWithinDistance } from "./locationService.js";
import matchingService from "./matchingService.js";

// Shared state
let io = null;
const userSockets = new Map(); // userId -> socket
const socketUsers = new Map(); // socketId -> userId
const matchmakingUsers = new Map(); // userId -> { socket, timestamp, preferences }

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

const findBestMatch = async (userId, userPreferences) => {
  let bestMatch = null;
  let bestScore = -1;

  // Get all users in the pool except the current user, sorted by timestamp
  const potentialMatches = Array.from(matchmakingUsers.entries())
    .filter(([uid]) => uid !== userId.toString())
    .sort(([, a], [, b]) => a.timestamp - b.timestamp) // Sort by timestamp, oldest first
    .slice(0, 100); // Limit to 100 matches

  if (potentialMatches.length === 0) return null;

  console.log(
    `[findBestMatch] Found ${potentialMatches.length} potential matches for user ${userId}`
  );

  // Fetch current user's data to get their location
  const currentUser = await User.findById(userId).select("-password").lean();
  if (!currentUser?.location?.coordinates) {
    console.log(`[findBestMatch] User ${userId} has no location data`);
    return null;
  }

  // Fetch all potential matches' data in parallel
  const matchData = await Promise.all(
    potentialMatches.map(async ([uid, data]) => {
      const [user, preferences] = await Promise.all([
        User.findById(uid).select("-password").lean(),
        UserPreference.findOne({ user: uid }).lean(),
      ]);
      return { uid, user, preferences, socket: data.socket };
    })
  );

  // Score each potential match
  for (const match of matchData) {
    if (!match.user || !match.preferences) continue;

    // Check location compatibility first
    const isLocationCompatible = isWithinDistance(
      match.user.location,
      currentUser.location,
      userPreferences.distance
    );

    if (!isLocationCompatible) {
      console.log(
        `[findBestMatch] User ${match.uid} is outside preferred distance for user ${userId}`
      );
      continue;
    }

    const score = calculateMatchScore(userPreferences, match.preferences);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = match;
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

const calculateMatchScore = (pref1, pref2) => {
  let score = 0;

  // Age compatibility (highest weight)
  if (pref1?.ageRange && pref2?.ageRange) {
    const age1 = calculateAge(pref1.user.dob);
    const age2 = calculateAge(pref2.user.dob);
    if (isAgeInRange(age1, pref2) && isAgeInRange(age2, pref1)) {
      score += 40; // High weight for age compatibility
    }
  }

  // Gender preference
  if (pref1?.interestedIn && pref2?.user?.gender) {
    if (pref1.interestedIn === pref2.user.gender) {
      score += 20;
    }
  }

  // Goal compatibility
  if (pref1?.goal && pref2?.goal) {
    const goals1 = [
      pref1.goal.primary,
      pref1.goal.secondary,
      pref1.goal.tertiary,
    ].filter(Boolean);
    const goals2 = [
      pref2.goal.primary,
      pref2.goal.secondary,
      pref2.goal.tertiary,
    ].filter(Boolean);

    // Find common goals between both users
    const commonGoals = goals1.filter((goal) => goals2.includes(goal));

    // Each common goal gets 1 point
    score += commonGoals.length;
  }

  // Shared interests
  if (pref1?.interests?.professional && pref2?.interests?.professional) {
    const sharedInterests = pref1.interests.professional.filter((interest) =>
      pref2.interests.professional.includes(interest)
    ).length;
    score += sharedInterests * 2;
  }

  if (pref1?.interests?.hobbies && pref2?.interests?.hobbies) {
    const sharedHobbies = pref1.interests.hobbies.filter((hobby) =>
      pref2.interests.hobbies.includes(hobby)
    ).length;
    score += sharedHobbies * 2;
  }

  return score;
};

const createAndNotifyMatch = async (userId1, userId2, socket1, socket2) => {
  try {
    // Remove both users from pool
    matchmakingUsers.delete(userId1.toString());
    matchmakingUsers.delete(userId2.toString());

    // Create match in database
    const { user1: matchedUser1, user2: matchedUser2 } =
      await matchingService.createMatch(userId1.toString(), userId2.toString());
    const matchId = `match_${userId1.toString()}_${userId2.toString()}`;

    // Join both users to the match room
    socket1.join(matchId);
    if (socket2) {
      socket2.join(matchId);
    }

    // Notify both users
    socket1.emit("matchFound", { matchId, matchedUser: matchedUser2?._id });
    if (socket2) {
      socket2.emit("matchFound", { matchId, matchedUser: matchedUser1?._id });
    }
  } catch (error) {
    // If error, put first user back in pool
    matchmakingUsers.set(userId1.toString(), {
      socket: socket1,
      timestamp: Date.now(),
    });
    throw error;
  }
};

const handleConnection = (socket) => {
  // Store user connection
  const userId = socket.user._id.toString();
  console.log("[handleConnection] New socket connection for user:", userId);
  console.log(
    "[handleConnection] Current userSockets Map size:",
    userSockets.size
  );

  // Store the new socket without removing existing ones
  userSockets.set(userId, socket);
  socketUsers.set(socket.id, userId);

  console.log(
    "[handleConnection] Updated userSockets Map size:",
    userSockets.size
  );
  console.log(
    "[handleConnection] Current socketUsers Map size:",
    socketUsers.size
  );

  // Update user's active status and refresh socket.user object
  User.findByIdAndUpdate(
    userId,
    { isActive: true, lastActive: new Date() },
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
    })
    .catch((error) => console.error("Error updating user status:", error));

  // Handle matchmaking
  socket.on("startMatchmaking", async () => {
    try {
      if (matchmakingUsers.has(userId)) return;

      // Fetch user preferences
      const preferences = await UserPreference.findOne({ user: userId }).lean();
      if (!preferences) {
        socket.emit("matchmakingError", { message: "No preferences found" });
        return;
      }

      // Add user to matchmaking pool with preferences
      matchmakingUsers.set(userId, {
        socket,
        timestamp: Date.now(),
        preferences,
      });

      // Find best match
      const bestMatch = await findBestMatch(userId, preferences);

      if (bestMatch) {
        await createAndNotifyMatch(
          userId,
          bestMatch.uid,
          socket,
          bestMatch.socket
        );
      }
    } catch (error) {
      socket.emit("matchmakingError", { message: error.message });
    }
  });

  socket.on("stopMatchmaking", () => {
    matchmakingUsers.delete(userId);
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
      const { matchId, encryptedContent, iv, receiverId } = data;

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
        encryptedData: encryptedContent,
        iv: iv,
        timestamp: Date.now(),
      });

      // Store the message in the database
      const message = await Message.create({
        sender: userId,
        receiver: receiverId,
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

  // Handle profile unlock request
  socket.on("unlockProfile", async ({ profileId, userId, matchId }) => {
    unlockProfile(socket, userId, profileId, matchId);
  });

  // Handle profile lock request
  socket.on("lockProfile", async ({ profileId, userId, matchId }) => {
    lockProfile(socket, userId, profileId, matchId);
  });

  // Handle chat cancellation
  socket.on("cancelChat", async (data) => {
    console.log("[cancelChat] Received cancel chat request:", data);

    try {
      const { matchId } = data;

      // Notify the room
      socket.to(matchId).emit("chatCancelled", { matchId });

      // Update socket.user
      socket.user = {
        ...socket.user,
      };

      // Leave the chat room
      socket.leave(matchId);

      console.log(`[cancelChat] User ${userId} left room ${matchId}`);
    } catch (error) {
      console.error("[cancelChat] Error:", error);
      socket.emit("error", { message: error.message });
    }
  });

  // Handle disconnection
  socket.on("disconnect", async (data) => {
    console.log("[disconnect] Socket disconnected for user:", userId);
    console.log("[disconnect] Current userSockets Map size:", userSockets.size);

    if (userId) {
      try {
        const { matchId } = data;

        if (matchId) {
          // Notify the room
          socket.to(matchId).emit("chatCancelled", { matchId });

          // Update socket.user
          socket.user = {
            ...socket.user,
          };

          // Leave the chat room
          socket.leave(matchId);
        }

        matchmakingUsers.delete(userId);

        // Only remove this specific socket
        userSockets.delete(userId);
        socketUsers.delete(socket.id);

        console.log("[disconnect] Removed socket mappings for user:", userId);
        console.log(
          "[disconnect] Updated userSockets Map size:",
          userSockets.size
        );
        console.log(
          "[disconnect] Updated socketUsers Map size:",
          socketUsers.size
        );

        // Check if user has any remaining connections
        const remainingConnections = Array.from(socketUsers.entries()).filter(
          ([_, uid]) => uid === userId
        ).length;

        if (remainingConnections === 0) {
          await User.findByIdAndUpdate(userId, {
            isActive: false,
            lastActive: new Date(),
          });
        }
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
