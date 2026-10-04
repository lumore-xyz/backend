import CreditLedger from "../models/creditLedger.model.js";
import User from "../models/user.model.js";
import { getNextUtcDayStart, getUtcDayStart } from "../utils/utcDate.js";
import { CREDIT_LEDGER_TYPE } from "../utils/creditLedger.js";
import { isVerifiedUser } from "../utils/verification.js";
import { runInTransaction } from "../utils/transaction.js";
import { CREDIT_RULES } from "./creditRules.js";

export const getDailyActiveBonusForUser = (user) =>
  isVerifiedUser(user)
    ? CREDIT_RULES.DAILY_ACTIVE_BONUS_VERIFIED
    : CREDIT_RULES.DAILY_ACTIVE_BONUS_UNVERIFIED;

export const isDailyActiveBonusDue = (lastDailyCreditAt, now = new Date()) => {
  const lastCreditAt = lastDailyCreditAt ? new Date(lastDailyCreditAt) : null;
  return !lastCreditAt || !Number.isFinite(lastCreditAt.getTime()) ||
    lastCreditAt < getUtcDayStart(now);
};

const getDailyRewardEligibilityFilter = (userId, dayStart) => ({
  _id: userId,
  $or: [{ lastDailyCreditAt: { $lt: dayStart } }, { lastDailyCreditAt: null }],
});

const getCurrentDailyRewardStatus = async (userId, nextDailyRewardAt) => {
  const current = await User.findById(userId)
    .select("credits lastDailyCreditAt isVerified verificationStatus")
    .lean();
  return {
    granted: false,
    credits: current?.credits ?? 0,
    lastDailyCreditAt: current?.lastDailyCreditAt ?? null,
    nextDailyRewardAt,
    dailyRewardAmount: current ? getDailyActiveBonusForUser(current) : 0,
  };
};

export const grantDailyActiveBonus = async (userId, now = new Date()) => {
  const dayStart = getUtcDayStart(now);
  const nextDailyRewardAt = getNextUtcDayStart(now);
  const eligibilityFilter = getDailyRewardEligibilityFilter(userId, dayStart);
  const candidate = await User.findOne(eligibilityFilter)
    .select("isVerified verificationStatus lastDailyCreditAt")
    .lean();
  if (!candidate) return getCurrentDailyRewardStatus(userId, nextDailyRewardAt);

  const bonus = getDailyActiveBonusForUser(candidate);
  const previousDailyCreditAt = candidate.lastDailyCreditAt ?? null;
  const awardWithoutTransaction = async () => {
    const user = await User.findOneAndUpdate(
      eligibilityFilter,
      { $inc: { credits: bonus }, $set: { lastDailyCreditAt: now } },
      { returnDocument: "after" },
    );
    if (!user) return null;

    try {
      await CreditLedger.create({
        user: userId,
        amount: bonus,
        type: CREDIT_LEDGER_TYPE.DAILY_ACTIVE,
        balanceAfter: user.credits,
        referenceType: CREDIT_LEDGER_TYPE.DAILY_ACTIVE,
        referenceId: dayStart.toISOString(),
      });
    } catch (error) {
      await User.updateOne(
        { _id: userId, lastDailyCreditAt: now },
        {
          $inc: { credits: -bonus },
          $set: { lastDailyCreditAt: previousDailyCreditAt },
        },
      );
      throw error;
    }
    return user;
  };

  const user = await runInTransaction(
    async (session) => {
      const updatedUser = await User.findOneAndUpdate(
        eligibilityFilter,
        { $inc: { credits: bonus }, $set: { lastDailyCreditAt: now } },
        { returnDocument: "after", session },
      );
      if (!updatedUser) return null;

      await CreditLedger.create(
        [{
          user: userId,
          amount: bonus,
          type: CREDIT_LEDGER_TYPE.DAILY_ACTIVE,
          balanceAfter: updatedUser.credits,
          referenceType: CREDIT_LEDGER_TYPE.DAILY_ACTIVE,
          referenceId: dayStart.toISOString(),
        }],
        { session, ordered: true },
      );
      return updatedUser;
    },
    { fallback: awardWithoutTransaction },
  );

  if (!user) return getCurrentDailyRewardStatus(userId, nextDailyRewardAt);
  return {
    granted: true,
    credits: user.credits,
    nextDailyRewardAt,
    dailyRewardAmount: bonus,
  };
};
