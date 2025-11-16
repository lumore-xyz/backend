import User from "../models/User.js";

export const appStatus = async (req, res) => {
  try {
    // Total user count
    const totalUsers = await User.countDocuments();

    // Active users count
    const activeUsers = await User.countDocuments({ isActive: true });
    const isMatching = await User.countDocuments({ isMatching: true });

    // Gender counts (case-insensitive)
    const womenCount = await User.countDocuments({
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
          women: womenCount,
          men: menCount,
          others: totalUsers - womenCount - menCount,
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
