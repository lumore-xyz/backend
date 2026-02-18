import mongoose from "mongoose";
import CreditLedger from "../models/creditLedger.model.js";
import User from "../models/user.model.js";

export const CREDIT_RULES = {
  SIGNUP_BONUS: 10,
  DAILY_ACTIVE_BONUS_VERIFIED: 3,
  DAILY_ACTIVE_BONUS_UNVERIFIED: 1,
  CONVERSATION_COST: 1,
  THIS_OR_THAT_APPROVAL_BONUS: 5,
  REFERRAL_VERIFICATION_BONUS: 10,
};

const getDailyActiveBonusForUser = (user) => {
  const isVerified = Boolean(
    user?.isVerified || user?.verificationStatus === "approved"
  );
  return isVerified
    ? CREDIT_RULES.DAILY_ACTIVE_BONUS_VERIFIED
    : CREDIT_RULES.DAILY_ACTIVE_BONUS_UNVERIFIED;
};

const isUserVerified = (user) =>
  Boolean(user?.isVerified || user?.verificationStatus === "approved");

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

  const candidate = await User.findOne({
    _id: userId,
    $or: [{ lastDailyCreditAt: { $lt: dayStart } }, { lastDailyCreditAt: null }],
  })
    .select("isVerified verificationStatus")
    .lean();

  if (!candidate) {
    const current = await User.findById(userId)
      .select("credits lastDailyCreditAt isVerified verificationStatus")
      .lean();
    return {
      granted: false,
      credits: current?.credits ?? 0,
      nextDailyRewardAt: nextDayStart,
      dailyRewardAmount: current ? getDailyActiveBonusForUser(current) : 0,
    };
  }

  const bonus = getDailyActiveBonusForUser(candidate);
  const user = await User.findOneAndUpdate(
    {
      _id: userId,
      $or: [{ lastDailyCreditAt: { $lt: dayStart } }, { lastDailyCreditAt: null }],
    },
    {
      $inc: { credits: bonus },
      $set: { lastDailyCreditAt: now },
    },
    { new: true }
  );

  if (!user) {
    const current = await User.findById(userId)
      .select("credits lastDailyCreditAt isVerified verificationStatus")
      .lean();
    return {
      granted: false,
      credits: current?.credits ?? 0,
      nextDailyRewardAt: nextDayStart,
      dailyRewardAmount: current ? getDailyActiveBonusForUser(current) : 0,
    };
  }

  await CreditLedger.create({
    user: userId,
    amount: bonus,
    type: "daily_active",
    balanceAfter: user.credits,
    referenceType: "daily_active",
    referenceId: dayStart.toISOString(),
  });

  return {
    granted: true,
    credits: user.credits,
    nextDailyRewardAt: nextDayStart,
    dailyRewardAmount: bonus,
  };
};

export const getCreditBalance = async (userId) => {
  const user = await User.findById(userId)
    .select("credits lastDailyCreditAt isVerified verificationStatus")
    .lean();
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
    dailyRewardAmount: getDailyActiveBonusForUser(user),
  };
};

export const spendCreditsForConversationStart = async (initiatorId, partnerId) => {
  const initiatorKey = initiatorId.toString();
  const partnerKey = partnerId.toString();
  const runWithoutTransaction = async () => {
    const u1 = await User.findOneAndUpdate(
      { _id: initiatorId, credits: { $gte: CREDIT_RULES.CONVERSATION_COST } },
      { $inc: { credits: -CREDIT_RULES.CONVERSATION_COST } },
      { new: true }
    );
    if (!u1) {
      return { success: false, reason: "INSUFFICIENT_CREDITS" };
    }

    const u2 = await User.findOneAndUpdate(
      { _id: partnerId, credits: { $gte: CREDIT_RULES.CONVERSATION_COST } },
      { $inc: { credits: -CREDIT_RULES.CONVERSATION_COST } },
      { new: true }
    );
    if (!u2) {
      await User.findByIdAndUpdate(initiatorId, {
        $inc: { credits: CREDIT_RULES.CONVERSATION_COST },
      });
      return { success: false, reason: "INSUFFICIENT_CREDITS" };
    }

    await CreditLedger.insertMany([
      {
        user: initiatorId,
        amount: -CREDIT_RULES.CONVERSATION_COST,
        type: "conversation_start",
        balanceAfter: u1.credits,
        referenceType: "user",
        referenceId: partnerKey,
        meta: { partnerId: partnerKey },
      },
      {
        user: partnerId,
        amount: -CREDIT_RULES.CONVERSATION_COST,
        type: "conversation_start",
        balanceAfter: u2.credits,
        referenceType: "user",
        referenceId: initiatorKey,
        meta: { partnerId: initiatorKey },
      },
    ]);

    return {
      success: true,
      balances: {
        [initiatorKey]: u1.credits,
        [partnerKey]: u2.credits,
      },
    };
  };

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
        [initiatorKey]: u1.credits,
        [partnerKey]: u2.credits,
      };
    });

    return { success: true, balances };
  } catch (error) {
    if (error.message === "INSUFFICIENT_CREDITS") {
      return { success: false, reason: "INSUFFICIENT_CREDITS" };
    }
    const msg = String(error?.message || "");
    const nonTxnMongo =
      msg.includes("Transaction numbers are only allowed on a replica set member or mongos") ||
      msg.includes("Transaction support is not available");
    if (nonTxnMongo) {
      return await runWithoutTransaction();
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

export const awardReferralBonusForVerifiedUser = async ({
  referredUserId,
  now = new Date(),
}) => {
  const referredUser = await User.findById(referredUserId)
    .select("_id username isVerified verificationStatus referredBy")
    .lean();

  if (!referredUser?.referredBy) {
    return { granted: false, reason: "NO_REFERRER" };
  }

  if (!isUserVerified(referredUser)) {
    return { granted: false, reason: "REFERRED_USER_NOT_VERIFIED" };
  }

  const referrer = await User.findById(referredUser.referredBy)
    .select("_id username isVerified verificationStatus")
    .lean();

  if (!referrer) {
    return { granted: false, reason: "REFERRER_NOT_FOUND" };
  }

  if (!isUserVerified(referrer)) {
    return { granted: false, reason: "REFERRER_NOT_VERIFIED" };
  }

  const existing = await CreditLedger.findOne({
    user: referrer._id,
    type: "referral_bonus",
    referenceType: "user",
    referenceId: referredUser._id.toString(),
  }).lean();

  if (existing) {
    return { granted: false, reason: "ALREADY_GRANTED" };
  }

  const updatedReferrer = await User.findByIdAndUpdate(
    referrer._id,
    { $inc: { credits: CREDIT_RULES.REFERRAL_VERIFICATION_BONUS } },
    { new: true }
  );

  if (!updatedReferrer) {
    return { granted: false, reason: "REFERRER_NOT_FOUND" };
  }

  await CreditLedger.create({
    user: referrer._id,
    amount: CREDIT_RULES.REFERRAL_VERIFICATION_BONUS,
    type: "referral_bonus",
    balanceAfter: updatedReferrer.credits,
    referenceType: "user",
    referenceId: referredUser._id.toString(),
    meta: {
      referralCode: referrer.username,
      referredUserId: referredUser._id.toString(),
      referredUsername: referredUser.username,
      awardedAt: now.toISOString(),
    },
  });

  return {
    granted: true,
    credits: updatedReferrer.credits,
    referrerId: referrer._id.toString(),
    referredUserId: referredUser._id.toString(),
  };
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
