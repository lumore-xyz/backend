import User from "../models/User.js";

const findPotentialMatches = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  // Reset daily conversations if needed
  await user.resetDailyConversations();

  // Check if user has reached daily limit
  if (user.dailyConversations <= 0) {
    throw new Error("Daily conversation limit reached");
  }

  // Simple query to find any active user
  const query = {
    _id: { $ne: userId },
    isActive: true,
    activeMatch: null,
  };

  // Get one random active user
  const match = await User.findOne(query).select(
    "-password -googleId -walletAddress"
  );

  if (!match) {
    // If no active user found, wait 30 seconds and try again
    await new Promise((resolve) => setTimeout(resolve, 30000));
    return await findActivePoolMatch(user);
  }

  return [match];
};

const createMatch = async (userId1, userId2) => {
  try {
    console.log(
      "[createMatch] Creating match between users:",
      userId1,
      userId2
    );

    // First verify both users exist and are available
    const [existingUser1, existingUser2] = await Promise.all([
      User.findById(userId1),
      User.findById(userId2),
    ]);

    console.log("[createMatch] Existing user1:", {
      id: existingUser1?._id,
      activeMatch: existingUser1?.activeMatch,
      isActive: existingUser1?.isActive,
    });
    console.log("[createMatch] Existing user2:", {
      id: existingUser2?._id,
      activeMatch: existingUser2?.activeMatch,
      isActive: existingUser2?.isActive,
    });

    if (!existingUser1 || !existingUser2) {
      throw new Error("One or both users not found");
    }

    // if (existingUser1.activeMatch || existingUser2.activeMatch) {
    //   throw new Error("One or both users already have an active match");
    // }

    // Update both users with their match
    const [user1, user2] = await Promise.all([
      User.findByIdAndUpdate(
        userId1,
        {
          activeMatch: userId2,
          $inc: { dailyConversations: -1 },
          isActive: true,
          lastActive: new Date(),
        },
        { new: true }
      )
        .select("-password -googleId -walletAddress")
        .lean(),
      User.findByIdAndUpdate(
        userId2,
        {
          activeMatch: userId1,
          $inc: { dailyConversations: -1 },
          isActive: true,
          lastActive: new Date(),
        },
        { new: true }
      )
        .select("-password -googleId -walletAddress")
        .lean(),
    ]);

    console.log("[createMatch] Updated user1:", {
      id: user1?._id,
      activeMatch: user1?.activeMatch,
      isActive: user1?.isActive,
      dailyConversations: user1?.dailyConversations,
    });
    console.log("[createMatch] Updated user2:", {
      id: user2?._id,
      activeMatch: user2?.activeMatch,
      isActive: user2?.isActive,
      dailyConversations: user2?.dailyConversations,
    });

    if (!user1 || !user2) {
      throw new Error("Failed to create match - update failed");
    }

    // Verify the match was created correctly
    if (
      user1.activeMatch?.toString() !== userId2.toString() ||
      user2.activeMatch?.toString() !== userId1.toString()
    ) {
      throw new Error(
        "Match verification failed - activeMatch IDs don't match"
      );
    }

    return { user1, user2 };
  } catch (error) {
    console.error("[createMatch] Error creating match:", error);
    throw error;
  }
};

const findActivePoolMatch = async (user) => {
  return await User.findOne({
    _id: { $ne: user._id },
    isActive: true,
    activeMatch: null,
  }).select("-password -googleId -walletAddress");
};

const calculateAge = (dateOfBirth) => {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }
  return age;
};

export default {
  findPotentialMatches,
  createMatch,
  findActivePoolMatch,
  calculateAge,
};
