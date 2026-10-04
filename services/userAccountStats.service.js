import User from "../models/user.model.js";
import { getActiveUserFilter } from "../utils/userActivity.js";

export const getUserAccountStats = async (now = new Date()) => {
  const [totalUsers, activeUsers, matchingUsers, archivedUsers] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments(getActiveUserFilter(now)),
    User.countDocuments({ isMatching: true, isArchived: { $ne: true } }),
    User.countDocuments({ isArchived: true }),
  ]);

  return { totalUsers, activeUsers, matchingUsers, archivedUsers };
};
