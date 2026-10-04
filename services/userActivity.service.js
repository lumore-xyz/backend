import User from "../models/user.model.js";

const ACTIVITY_WRITE_INTERVAL_MS = 5 * 60 * 1000;

export const isUserActivityDue = (lastActive, now = new Date()) => {
  const lastActiveAt = lastActive ? new Date(lastActive).getTime() : NaN;
  return !Number.isFinite(lastActiveAt) ||
    now.getTime() - lastActiveAt > ACTIVITY_WRITE_INTERVAL_MS;
};

export const recordUserActivity = (userId, now = new Date()) =>
  User.updateOne(
    {
      _id: userId,
      $or: [
        { lastActive: null },
        { lastActive: { $lt: new Date(now.getTime() - ACTIVITY_WRITE_INTERVAL_MS) } },
      ],
    },
    { $set: { lastActive: now } },
  );
