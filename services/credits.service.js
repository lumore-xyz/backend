import mongoose from "mongoose";
import CreditLedger from "../models/creditLedger.model.js";
import User from "../models/user.model.js";

export const CREDIT_RULES = {
  SIGNUP_BONUS: 10,
  DAILY_ACTIVE_BONUS: 3,
  CONVERSATION_COST: 1,
  THIS_OR_THAT_APPROVAL_BONUS: 5,
};

export const getUtcDayStart = (date = new Date()) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

export const getNextUtcDayStart = (date = new Date()) => {
  const d = getUtcDayStart(date);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
};

export const grantSignupBonusIfMissing = async (userId) => {
  const existing = await CreditLedger.findOne({
    user: userId,
    type: "signup_bonus",
  }).lean();

  if (existing) return { granted: false };

  const user = await User.findById(userId).select("credits").lean();

  if (!user) return { granted: false };

  await CreditLedger.create({
    user: userId,
    amount: CREDIT_RULES.SIGNUP_BONUS,
    type: "signup_bonus",
    balanceAfter: user.credits,
    referenceType: "user",
    referenceId: userId.toString(),
  });

  return { granted: true, credits: user.credits };
};

export const grantDailyActiveBonus = async (userId, now = new Date()) => {
  const dayStart = getUtcDayStart(now);
  const nextDayStart = getNextUtcDayStart(now);

  const user = await User.findOneAndUpdate(
    {
      _id: userId,
      $or: [{ lastDailyCreditAt: { $lt: dayStart } }, { lastDailyCreditAt: null }],
    },
    {
      $inc: { credits: CREDIT_RULES.DAILY_ACTIVE_BONUS },
      $set: { lastDailyCreditAt: now },
    },
    { new: true }
  );

  if (!user) {
    const current = await User.findById(userId).select("credits lastDailyCreditAt").lean();
    return {
      granted: false,
      credits: current?.credits ?? 0,
      nextDailyRewardAt: nextDayStart,
    };
  }

  await CreditLedger.create({
    user: userId,
    amount: CREDIT_RULES.DAILY_ACTIVE_BONUS,
    type: "daily_active",
    balanceAfter: user.credits,
    referenceType: "daily_active",
    referenceId: dayStart.toISOString(),
  });

  return { granted: true, credits: user.credits, nextDailyRewardAt: nextDayStart };
};

export const getCreditBalance = async (userId) => {
  const user = await User.findById(userId).select("credits lastDailyCreditAt").lean();
  if (!user) return null;

  const dayStart = getUtcDayStart(new Date());
  const rewardGrantedToday = !!(
    user.lastDailyCreditAt && new Date(user.lastDailyCreditAt) >= dayStart
  );

  return {
    credits: user.credits ?? 0,
    lastDailyCreditAt: user.lastDailyCreditAt,
    rewardGrantedToday,
    nextDailyRewardAt: getNextUtcDayStart(new Date()),
  };
};

export const spendCreditsForConversationStart = async (initiatorId, partnerId) => {
  const session = await mongoose.startSession();
  try {
    let balances = null;
    await session.withTransaction(async () => {
      const [u1, u2] = await Promise.all([
        User.findOneAndUpdate(
          { _id: initiatorId, credits: { $gte: CREDIT_RULES.CONVERSATION_COST } },
          { $inc: { credits: -CREDIT_RULES.CONVERSATION_COST } },
          { new: true, session }
        ),
        User.findOneAndUpdate(
          { _id: partnerId, credits: { $gte: CREDIT_RULES.CONVERSATION_COST } },
          { $inc: { credits: -CREDIT_RULES.CONVERSATION_COST } },
          { new: true, session }
        ),
      ]);

      if (!u1 || !u2) {
        throw new Error("INSUFFICIENT_CREDITS");
      }

      await CreditLedger.insertMany(
        [
          {
            user: initiatorId,
            amount: -CREDIT_RULES.CONVERSATION_COST,
            type: "conversation_start",
            balanceAfter: u1.credits,
            referenceType: "user",
            referenceId: partnerId.toString(),
            meta: { partnerId: partnerId.toString() },
          },
          {
            user: partnerId,
            amount: -CREDIT_RULES.CONVERSATION_COST,
            type: "conversation_start",
            balanceAfter: u2.credits,
            referenceType: "user",
            referenceId: initiatorId.toString(),
            meta: { partnerId: initiatorId.toString() },
          },
        ],
        { session }
      );

      balances = {
        [initiatorId.toString()]: u1.credits,
        [partnerId.toString()]: u2.credits,
      };
    });

    return { success: true, balances };
  } catch (error) {
    if (error.message === "INSUFFICIENT_CREDITS") {
      return { success: false, reason: "INSUFFICIENT_CREDITS" };
    }
    throw error;
  } finally {
    await session.endSession();
  }
};

export const awardCreditsForThisOrThatApproval = async ({
  userId,
  questionId,
  now = new Date(),
}) => {
  const existing = await CreditLedger.findOne({
    user: userId,
    type: "this_or_that_approved",
    referenceType: "this_or_that_question",
    referenceId: questionId.toString(),
  }).lean();

  if (existing) return { granted: false };

  const user = await User.findByIdAndUpdate(
    userId,
    { $inc: { credits: CREDIT_RULES.THIS_OR_THAT_APPROVAL_BONUS } },
    { new: true }
  );
  if (!user) return { granted: false };

  await CreditLedger.create({
    user: userId,
    amount: CREDIT_RULES.THIS_OR_THAT_APPROVAL_BONUS,
    type: "this_or_that_approved",
    balanceAfter: user.credits,
    referenceType: "this_or_that_question",
    referenceId: questionId.toString(),
    meta: { awardedAt: now.toISOString() },
  });

  return { granted: true, credits: user.credits };
};

export const getCreditHistory = async (userId, page = 1, limit = 20) => {
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const skip = (safePage - 1) * safeLimit;

  const [items, total] = await Promise.all([
    CreditLedger.find({ user: userId }).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
    CreditLedger.countDocuments({ user: userId }),
  ]);

  return {
    items,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      hasMore: skip + items.length < total,
      nextPage: skip + items.length < total ? safePage + 1 : null,
    },
  };
};
