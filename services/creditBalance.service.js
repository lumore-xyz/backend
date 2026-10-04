import User from "../models/user.model.js";
import { getNextUtcDayStart, getUtcDayStart } from "../utils/utcDate.js";
import { getDailyActiveBonusForUser } from "./dailyActiveCredits.service.js";
import { getRewardedAdQuota } from "./rewardedAdCredits.service.js";

export const getCreditBalance = async (userId) => {
  const now = new Date();
  const user = await User.findById(userId)
    .select("credits lastDailyCreditAt isVerified verificationStatus")
    .lean();
  if (!user) return null;

  const dayStart = getUtcDayStart(now);
  const rewardGrantedToday = Boolean(
    user.lastDailyCreditAt && new Date(user.lastDailyCreditAt) >= dayStart,
  );
  const rewardedAdQuota = await getRewardedAdQuota(userId, now);
  return {
    credits: user.credits ?? 0,
    lastDailyCreditAt: user.lastDailyCreditAt,
    rewardGrantedToday,
    nextDailyRewardAt: getNextUtcDayStart(now),
    dailyRewardAmount: getDailyActiveBonusForUser(user),
    ...rewardedAdQuota,
  };
};
