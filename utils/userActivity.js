const ACTIVE_USER_WINDOW_DAYS = 30;

export const getActiveUserFilter = (now = new Date()) => ({
  isArchived: { $ne: true },
  lastActive: {
    $gte: new Date(now.getTime() - ACTIVE_USER_WINDOW_DAYS * 24 * 60 * 60 * 1000),
    $lte: now,
  },
});

export const getInactiveUserCount = ({ totalUsers, archivedUsers, activeUsers }) =>
  Math.max(totalUsers - archivedUsers - activeUsers, 0);
