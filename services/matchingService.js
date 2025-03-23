import User from "../models/User.js";

class MatchingService {
  // Find potential matches for a user based on preferences and profile
  async findPotentialMatches(userId) {
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");

    // Reset daily conversations if needed
    user.resetDailyConversations();
    await user.save();

    // Check if user has reached daily conversation limit
    if (user.dailyConversations >= 10) {
      throw new Error("Daily conversation limit reached");
    }

    // Build query based on preferences
    const query = {
      _id: { $ne: userId },
      isActive: true,
      isVerified: true,
      "preferences.interestedIn": user.gender,
      "preferences.ageRange.min": { $lte: this.calculateAge(user.dateOfBirth) },
      "preferences.ageRange.max": { $gte: this.calculateAge(user.dateOfBirth) },
      activeMatch: null,
    };

    // Add location-based query if maxDistance is specified
    if (user.preferences.maxDistance) {
      query.currentLocation = {
        $near: {
          $geometry: user.currentLocation,
          $maxDistance: user.preferences.maxDistance * 1000, // Convert km to meters
        },
      };
    }

    // Find potential matches
    const potentialMatches = await User.find(query)
      .select("-password -googleId -walletAddress")
      .limit(20);

    // Filter matches based on additional preferences and rejected profiles
    const matches = potentialMatches.filter((match) => {
      // Check if user has rejected this profile
      if (
        user.rejectedProfiles.some(
          (rp) => rp.rejectedUser.toString() === match._id.toString()
        )
      ) {
        return false;
      }

      // Check if match has rejected user's profile
      if (
        match.rejectedProfiles.some(
          (rp) => rp.rejectedUser.toString() === userId.toString()
        )
      ) {
        return false;
      }

      // Check if both users are interested in each other's gender
      if (!match.preferences.interestedIn.includes(user.gender)) return false;

      // Check age compatibility
      const matchAge = this.calculateAge(match.dateOfBirth);
      if (
        matchAge < user.preferences.ageRange.min ||
        matchAge > user.preferences.ageRange.max
      )
        return false;

      // Check relationship type compatibility
      if (
        user.preferences.relationshipType.length > 0 &&
        match.preferences.relationshipType.length > 0
      ) {
        const hasCommonRelationshipType =
          user.preferences.relationshipType.some((type) =>
            match.preferences.relationshipType.includes(type)
          );
        if (!hasCommonRelationshipType) return false;
      }

      // Check language compatibility
      if (user.preferences.languages.length > 0 && match.languages.length > 0) {
        const hasCommonLanguage = user.preferences.languages.some((lang) =>
          match.languages.includes(lang)
        );
        if (!hasCommonLanguage) return false;
      }

      // Check diet compatibility
      if (
        user.preferences.diet.length > 0 &&
        match.diet &&
        !user.preferences.diet.includes(match.diet)
      )
        return false;

      // Check education compatibility
      if (
        user.preferences.education.length > 0 &&
        match.education?.institution &&
        !user.preferences.education.includes(match.education.institution)
      )
        return false;

      // Check personality type compatibility
      if (
        user.preferences.personalityType.length > 0 &&
        match.personalityType &&
        !user.preferences.personalityType.includes(match.personalityType)
      )
        return false;

      // Check hometown compatibility
      if (
        user.preferences.hometown.length > 0 &&
        match.hometown &&
        !user.preferences.hometown.includes(match.hometown)
      )
        return false;

      return true;
    });

    return matches;
  }

  // Create a match between two users
  async createMatch(userId1, userId2) {
    const [user1, user2] = await Promise.all([
      User.findById(userId1),
      User.findById(userId2),
    ]);

    if (!user1 || !user2) throw new Error("One or both users not found");
    if (user1.activeMatch || user2.activeMatch)
      throw new Error("One or both users already in a match");

    // Update both users with active match
    user1.activeMatch = userId2;
    user2.activeMatch = userId1;

    // Increment daily conversations
    user1.dailyConversations += 1;
    user2.dailyConversations += 1;

    await Promise.all([user1.save(), user2.save()]);

    return { user1, user2 };
  }

  // End a match between two users
  async endMatch(userId1, userId2, reason = null) {
    const [user1, user2] = await Promise.all([
      User.findById(userId1),
      User.findById(userId2),
    ]);

    if (!user1 || !user2) throw new Error("One or both users not found");
    if (
      user1.activeMatch?.toString() !== userId2 ||
      user2.activeMatch?.toString() !== userId1
    ) {
      throw new Error("Users are not currently matched");
    }

    // Clear active matches
    user1.activeMatch = null;
    user2.activeMatch = null;

    // If reason is provided, it's a report
    if (reason) {
      const report = {
        user: userId1,
        reason,
        timestamp: new Date(),
      };
      user2.reportedBy.push(report);
    }

    await Promise.all([user1.save(), user2.save()]);

    return { user1, user2 };
  }

  // Save a chat to a slot
  async saveChat(userId1, userId2, messages) {
    const [user1, user2] = await Promise.all([
      User.findById(userId1),
      User.findById(userId2),
    ]);

    if (!user1 || !user2) throw new Error("One or both users not found");

    // Add chat to saved chats for both users
    const savedChat = {
      match: userId2,
      messages: messages.map((msg) => ({
        sender: msg.sender,
        content: msg.content,
        timestamp: msg.timestamp || new Date(),
      })),
    };

    user1.savedChats.push(savedChat);
    user2.savedChats.push({
      ...savedChat,
      match: userId1,
    });

    await Promise.all([user1.save(), user2.save()]);

    return { user1, user2 };
  }

  // Helper method to calculate age
  calculateAge(dateOfBirth) {
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
  }

  // Reject a profile
  async rejectProfile(userId, rejectedUserId) {
    const [user, rejectedUser] = await Promise.all([
      User.findById(userId),
      User.findById(rejectedUserId),
    ]);

    if (!user || !rejectedUser) throw new Error("One or both users not found");

    // Add to rejected profiles
    user.rejectedProfiles.push({
      rejectedUser: rejectedUserId,
      rejectedAt: new Date(),
    });

    await user.save();

    return { user };
  }
}

export default new MatchingService();
