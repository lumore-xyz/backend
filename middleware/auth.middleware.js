import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import {
  grantDailyActiveBonus,
  isDailyActiveBonusDue,
} from "../services/dailyActiveCredits.service.js";
import {
  isUserActivityDue,
  recordUserActivity,
} from "../services/userActivity.service.js";
import { logError } from "../utils/logError.js";

export const protect = async (req, res, next) => {
  const token = req.headers.authorization?.match(/^Bearer\s+(\S+)\s*$/i)?.[1];

  if (!token) {
    return res
      .status(401)
      .json({ message: "Not authorized, no token provided" });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  } catch {
    return res.status(401).json({ message: "Not authorized, token failed" });
  }

  const user = await User.findById(decoded.id).select(
    "_id isArchived isAdmin location isVerified verificationStatus lastActive lastDailyCreditAt",
  );

  if (!user) {
    return res.status(401).json({ message: "User not found" });
  }
  if (user.isArchived) {
    return res.status(403).json({ message: "Account is archived" });
  }

  req.user = user;
  const now = new Date();
  if (isDailyActiveBonusDue(user.lastDailyCreditAt, now)) {
    grantDailyActiveBonus(user._id, now).catch((error) => {
      logError("Failed to grant daily active bonus", error);
    });
  }
  if (isUserActivityDue(user.lastActive, now)) {
    recordUserActivity(user._id, now).catch((error) => {
      logError("Failed to record user activity", error);
    });
  }
  next();
};
