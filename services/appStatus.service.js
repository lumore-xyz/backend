import User from "../models/user.model.js";
import { getInactiveUserCount } from "../utils/userActivity.js";
import { getUserAccountStats } from "./userAccountStats.service.js";

export const getAppStatusData = async ({ now = new Date() } = {}) => {
  const [accountStats, woman, man] = await Promise.all([
    getUserAccountStats(now),
    User.countDocuments({ gender: { $regex: /^woman$/i } }),
    User.countDocuments({ gender: { $regex: /^man$/i } }),
  ]);
  const { totalUsers, archivedUsers, activeUsers, matchingUsers } = accountStats;

  return {
    totalUsers,
    activeUsers,
    isMatching: matchingUsers,
    inactiveUsers: getInactiveUserCount({
      totalUsers,
      archivedUsers,
      activeUsers,
    }),
    genderDistribution: {
      woman,
      man,
      others: totalUsers - woman - man,
    },
  };
};
