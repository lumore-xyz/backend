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

    if (!existingUser1 || !existingUser2) {
      throw new Error("One or both users not found");
    }

    // Update both users with their match
    const [user1, user2] = await Promise.all([
      User.findByIdAndUpdate(
        userId1,
        {
          $inc: { dailyConversations: -1 },
          isActive: true,
          isMatching: false,
          matchmakingTimestamp: null,
          matchchedUserId: userId2,
          lastActive: new Date(),
        },
        { new: true }
      )
        .select("-password -googleId -walletAddress")
        .lean(),
      User.findByIdAndUpdate(
        userId2,
        {
          $inc: { dailyConversations: -1 },
          isActive: true,
          isMatching: false,
          matchmakingTimestamp: null,
          matchchedUserId: userId1,
          lastActive: new Date(),
        },
        { new: true }
      )
        .select("-password -googleId -walletAddress")
        .lean(),
    ]);

    if (!user1 || !user2) {
      throw new Error("Failed to create match - update failed");
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
