import User from "../models/user.model.js";
import { getPreferenceBasedAvailableCount } from "../services/matchmaking.service.js";

export const appStatus = async (req, res) => {
  try {
    // Total user count
    const totalUsers = await User.countDocuments();

    // Active users count
    const activeUsers = await User.countDocuments({ isActive: true });
    const isMatching = await User.countDocuments({ isMatching: true });

    // Gender counts (case-insensitive)
    const womanCount = await User.countDocuments({
      gender: { $regex: /^woman$/i },
    });

    const menCount = await User.countDocuments({
      gender: { $regex: /^man$/i },
    });

    // Return response
    return res.status(200).json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        isMatching,
        inactiveUsers: totalUsers - activeUsers,
        genderDistribution: {
          woman: womanCount,
          man: menCount,
          others: totalUsers - womanCount - menCount,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching app status:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch app status",
      error: error.message,
    });
  }
};

export const preferenceMatchCount = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const count = await getPreferenceBasedAvailableCount({ userId });
    return res.status(200).json({
      success: true,
      data: {
        availableUsers: count,
      },
    });
  } catch (error) {
    console.error("Error fetching preference match count:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch preference match count",
      error: error.message,
    });
  }
};
