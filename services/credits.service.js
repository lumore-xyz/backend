import mongoose from "mongoose";
import CreditLedger from "../models/creditLedger.model.js";
import User from "../models/user.model.js";
import {
  isTransactionUnsupportedError,
  runInTransaction,
} from "../utils/transaction.js";

const CONVERSATION_CREDIT_LOG_PREFIX = "[credits:conversation-start]";

export const CREDIT_RULES = {
  SIGNUP_BONUS: 10,
  DAILY_ACTIVE_BONUS_VERIFIED: 3,
  DAILY_ACTIVE_BONUS_UNVERIFIED: 1,
  CONVERSATION_COST: 1,
  THIS_OR_THAT_APPROVAL_BONUS: 5,
  REFERRAL_VERIFICATION_BONUS: 10,
  REWARDED_AD_CREDIT: 1,
  REWARDED_AD_MAX_PER_HOUR: 3,
  REWARDED_AD_WINDOW_MS: 60 * 60 * 1000,
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

export const getRewardedAdWindowStart = (date = new Date()) =>
  new Date(date.getTime() - CREDIT_RULES.REWARDED_AD_WINDOW_MS);

const getMongoConnectionDebugInfo = () => ({
  readyState: mongoose.connection.readyState,
  host: mongoose.connection.host || null,
  name: mongoose.connection.name || null,
});

const logConversationCreditStep = (stage, details = {}) => {
  console.info(`${CONVERSATION_CREDIT_LOG_PREFIX} ${stage}`, details);
};

const buildConversationLedgerEntries = ({
  initiatorId,
  partnerId,
  initiatorBalance,
  partnerBalance,
}) => [
  {
    user: initiatorId,
    amount: -CREDIT_RULES.CONVERSATION_COST,
    type: "conversation_start",
    balanceAfter: initiatorBalance,
    referenceType: "user",
    referenceId: partnerId.toString(),
    meta: { partnerId: partnerId.toString() },
  },
  {
    user: partnerId,
    amount: -CREDIT_RULES.CONVERSATION_COST,
    type: "conversation_start",
    balanceAfter: partnerBalance,
    referenceType: "user",
    referenceId: initiatorId.toString(),
    meta: { partnerId: initiatorId.toString() },
  },
];

export const getRewardedAdQuotaFromClaims = (claims = [], now = new Date()) => {
  const windowStart = getRewardedAdWindowStart(now);
  const activeClaims = claims
    .map((claim) => {
      const value = claim?.createdAt ?? claim;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    })
    .filter((date) => date && date > windowStart)
    .sort((a, b) => a.getTime() - b.getTime());

  const watchedInWindow = activeClaims.length;
  const remainingInWindow = Math.max(
    CREDIT_RULES.REWARDED_AD_MAX_PER_HOUR - watchedInWindow,
    0,
  );
  const nextEligibleAt =
    remainingInWindow > 0 || !activeClaims[0]
      ? null
      : new Date(
          activeClaims[0].getTime() + CREDIT_RULES.REWARDED_AD_WINDOW_MS,
        );

  return {
    rewardedAdsMaxPerHour: CREDIT_RULES.REWARDED_AD_MAX_PER_HOUR,
    rewardedAdsWatchedInWindow: watchedInWindow,
    rewardedAdsRemainingInWindow: remainingInWindow,
    rewardedAdsNextEligibleAt: nextEligibleAt,
  };
};

const getRewardedAdQuota = async (userId, now = new Date()) => {
  const windowStart = getRewardedAdWindowStart(now);
  const claims = await CreditLedger.find({
    user: userId,
    type: "rewarded_ad_watch",
    createdAt: { $gt: windowStart },
  })
    .select("createdAt")
    .sort({ createdAt: 1 })
    .lean();

  return getRewardedAdQuotaFromClaims(claims, now);
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
    { returnDocument: "after" }
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
  const now = new Date();
  const user = await User.findById(userId)
    .select("credits lastDailyCreditAt isVerified verificationStatus")
    .lean();
  if (!user) return null;

  const dayStart = getUtcDayStart(now);
  const rewardGrantedToday = !!(
    user.lastDailyCreditAt && new Date(user.lastDailyCreditAt) >= dayStart
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

export const claimRewardedAdCredit = async ({
  userId,
  claimId,
  now = new Date(),
}) => {
  const normalizedClaimId = String(claimId || "").trim();
  if (!normalizedClaimId || normalizedClaimId.length > 128) {
    const error = new Error("INVALID_CLAIM_ID");
    error.statusCode = 400;
    throw error;
  }

  const user = await User.findById(userId).select("credits").lean();
  if (!user) {
    return { granted: false, reason: "USER_NOT_FOUND" };
  }

  const existing = await CreditLedger.findOne({
    user: userId,
    type: "rewarded_ad_watch",
    referenceType: "rewarded_ad_session",
    referenceId: normalizedClaimId,
  }).lean();

  if (existing) {
    const quota = await getRewardedAdQuota(userId, now);
    return {
      granted: false,
      reason: "DUPLICATE_CLAIM",
      credits: user.credits ?? 0,
      ...quota,
    };
  }

  const quota = await getRewardedAdQuota(userId, now);
  if (quota.rewardedAdsRemainingInWindow <= 0) {
    return {
      granted: false,
      reason: "HOURLY_LIMIT_REACHED",
      credits: user.credits ?? 0,
      ...quota,
    };
  }

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { $inc: { credits: CREDIT_RULES.REWARDED_AD_CREDIT } },
    { returnDocument: "after" },
  ).lean();

  if (!updatedUser) {
    return { granted: false, reason: "USER_NOT_FOUND" };
  }

  try {
    const ledgerEntry = await CreditLedger.create({
      user: userId,
      amount: CREDIT_RULES.REWARDED_AD_CREDIT,
      type: "rewarded_ad_watch",
      balanceAfter: updatedUser.credits,
      referenceType: "rewarded_ad_session",
      referenceId: normalizedClaimId,
      meta: { awardedAt: now.toISOString() },
    });

    const nextQuota = await getRewardedAdQuota(userId, now);
    if (
      nextQuota.rewardedAdsWatchedInWindow >
      CREDIT_RULES.REWARDED_AD_MAX_PER_HOUR
    ) {
      await Promise.all([
        CreditLedger.deleteOne({ _id: ledgerEntry._id }),
        User.findByIdAndUpdate(userId, {
          $inc: { credits: -CREDIT_RULES.REWARDED_AD_CREDIT },
        }),
      ]);
      const [currentUser, refreshedQuota] = await Promise.all([
        User.findById(userId).select("credits").lean(),
        getRewardedAdQuota(userId, now),
      ]);
      return {
        granted: false,
        reason: "HOURLY_LIMIT_REACHED",
        credits: currentUser?.credits ?? 0,
        ...refreshedQuota,
      };
    }

    return {
      granted: true,
      amountAwarded: CREDIT_RULES.REWARDED_AD_CREDIT,
      credits: updatedUser.credits ?? 0,
      ...nextQuota,
    };
  } catch (error) {
    await User.findByIdAndUpdate(userId, {
      $inc: { credits: -CREDIT_RULES.REWARDED_AD_CREDIT },
    });

    if (error?.code === 11000) {
      const [currentUser, latestQuota] = await Promise.all([
        User.findById(userId).select("credits").lean(),
        getRewardedAdQuota(userId, now),
      ]);
      return {
        granted: false,
        reason: "DUPLICATE_CLAIM",
        credits: currentUser?.credits ?? 0,
        ...latestQuota,
      };
    }

    throw error;
  }
};

export const spendCreditsForConversationStart = async (initiatorId, partnerId) => {
  const initiatorKey = initiatorId.toString();
  const partnerKey = partnerId.toString();
  const runWithoutTransaction = async (fallbackError = null) => {
    logConversationCreditStep("fallback_start", {
      initiatorId: initiatorKey,
      partnerId: partnerKey,
      connection: getMongoConnectionDebugInfo(),
      trigger: fallbackError?.message || null,
    });

    let initiatorUser = null;
    let partnerUser = null;
    let initiatorLedger = null;

    try {
      initiatorUser = await User.findOneAndUpdate(
        { _id: initiatorId, credits: { $gte: CREDIT_RULES.CONVERSATION_COST } },
        { $inc: { credits: -CREDIT_RULES.CONVERSATION_COST } },
        { returnDocument: "after" },
      );
      if (!initiatorUser) {
        logConversationCreditStep("fallback_initiator_insufficient", {
          initiatorId: initiatorKey,
          partnerId: partnerKey,
        });
        return { success: false, reason: "INSUFFICIENT_CREDITS" };
      }

      logConversationCreditStep("fallback_initiator_debited", {
        initiatorId: initiatorKey,
        balanceAfter: initiatorUser.credits,
      });

      partnerUser = await User.findOneAndUpdate(
        { _id: partnerId, credits: { $gte: CREDIT_RULES.CONVERSATION_COST } },
        { $inc: { credits: -CREDIT_RULES.CONVERSATION_COST } },
        { returnDocument: "after" },
      );
      if (!partnerUser) {
        logConversationCreditStep("fallback_partner_insufficient", {
          initiatorId: initiatorKey,
          partnerId: partnerKey,
          initiatorBalanceBeforeRollback: initiatorUser.credits,
        });
        await User.findByIdAndUpdate(initiatorId, {
          $inc: { credits: CREDIT_RULES.CONVERSATION_COST },
        });
        logConversationCreditStep("fallback_initiator_rollback_complete", {
          initiatorId: initiatorKey,
        });
        return { success: false, reason: "INSUFFICIENT_CREDITS" };
      }

      logConversationCreditStep("fallback_partner_debited", {
        partnerId: partnerKey,
        balanceAfter: partnerUser.credits,
      });

      initiatorLedger = await CreditLedger.create({
        user: initiatorId,
        amount: -CREDIT_RULES.CONVERSATION_COST,
        type: "conversation_start",
        balanceAfter: initiatorUser.credits,
        referenceType: "user",
        referenceId: partnerKey,
        meta: { partnerId: partnerKey },
      });

      await CreditLedger.create({
        user: partnerId,
        amount: -CREDIT_RULES.CONVERSATION_COST,
        type: "conversation_start",
        balanceAfter: partnerUser.credits,
        referenceType: "user",
        referenceId: initiatorKey,
        meta: { partnerId: initiatorKey },
      });

      logConversationCreditStep("fallback_ledger_written", {
        initiatorId: initiatorKey,
        partnerId: partnerKey,
      });

      return {
        success: true,
        balances: {
          [initiatorKey]: initiatorUser.credits,
          [partnerKey]: partnerUser.credits,
        },
      };
    } catch (fallbackWriteError) {
      logConversationCreditStep("fallback_error", {
        initiatorId: initiatorKey,
        partnerId: partnerKey,
        message: fallbackWriteError?.message || "unknown_error",
      });

      if (initiatorLedger?._id) {
        await CreditLedger.deleteOne({ _id: initiatorLedger._id });
      }
      if (partnerUser?._id) {
        await User.findByIdAndUpdate(partnerId, {
          $inc: { credits: CREDIT_RULES.CONVERSATION_COST },
        });
      }
      if (initiatorUser?._id) {
        await User.findByIdAndUpdate(initiatorId, {
          $inc: { credits: CREDIT_RULES.CONVERSATION_COST },
        });
      }

      throw fallbackWriteError;
    }
  };

  logConversationCreditStep("start", {
    initiatorId: initiatorKey,
    partnerId: partnerKey,
    connection: getMongoConnectionDebugInfo(),
  });

  try {
    const transactionResult = await runInTransaction(
      async (session) => {
        logConversationCreditStep("session_started", {
          initiatorId: initiatorKey,
          partnerId: partnerKey,
          hasSession: Boolean(session),
          inTransaction: session.inTransaction(),
        });

        logConversationCreditStep("transaction_begin", {
          initiatorId: initiatorKey,
          partnerId: partnerKey,
          inTransaction: session.inTransaction(),
        });

        const initiatorUser = await User.findOneAndUpdate(
          { _id: initiatorId, credits: { $gte: CREDIT_RULES.CONVERSATION_COST } },
          { $inc: { credits: -CREDIT_RULES.CONVERSATION_COST } },
          { returnDocument: "after", session },
        );
        const partnerUser = await User.findOneAndUpdate(
          { _id: partnerId, credits: { $gte: CREDIT_RULES.CONVERSATION_COST } },
          { $inc: { credits: -CREDIT_RULES.CONVERSATION_COST } },
          { returnDocument: "after", session },
        );

        logConversationCreditStep("transaction_debit_results", {
          initiatorId: initiatorKey,
          partnerId: partnerKey,
          initiatorDebited: Boolean(initiatorUser),
          partnerDebited: Boolean(partnerUser),
          initiatorBalanceAfter: initiatorUser?.credits ?? null,
          partnerBalanceAfter: partnerUser?.credits ?? null,
        });

        if (!initiatorUser || !partnerUser) {
          logConversationCreditStep("transaction_insufficient_credits", {
            initiatorId: initiatorKey,
            partnerId: partnerKey,
            initiatorDebited: Boolean(initiatorUser),
            partnerDebited: Boolean(partnerUser),
          });
          throw new Error("INSUFFICIENT_CREDITS");
        }

        const createdLedgerEntries = await CreditLedger.create(
          buildConversationLedgerEntries({
            initiatorId,
            partnerId,
            initiatorBalance: initiatorUser.credits,
            partnerBalance: partnerUser.credits,
          }),
          { session },
        );

        logConversationCreditStep("transaction_ledger_written", {
          initiatorId: initiatorKey,
          partnerId: partnerKey,
          ledgerCount: createdLedgerEntries.length,
        });

        return {
          success: true,
          balances: {
            [initiatorKey]: initiatorUser.credits,
            [partnerKey]: partnerUser.credits,
          },
        };
      },
      {
        fallback: async (fallbackError) => {
          logConversationCreditStep("transaction_fallback_triggered", {
            initiatorId: initiatorKey,
            partnerId: partnerKey,
            message: fallbackError?.message || "unknown_error",
          });
          return await runWithoutTransaction(fallbackError);
        },
        shouldFallback: isTransactionUnsupportedError,
      },
    );

    if (transactionResult?.success) {
      logConversationCreditStep("transaction_success", {
        initiatorId: initiatorKey,
        partnerId: partnerKey,
        balances: transactionResult.balances,
      });
    }

    return transactionResult;
  } catch (error) {
    logConversationCreditStep("transaction_error", {
      initiatorId: initiatorKey,
      partnerId: partnerKey,
      message: error?.message || "unknown_error",
      name: error?.name || null,
      code: error?.code ?? null,
      connection: getMongoConnectionDebugInfo(),
    });

    if (error.message === "INSUFFICIENT_CREDITS") {
      return { success: false, reason: "INSUFFICIENT_CREDITS" };
    }
    throw error;
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
    { returnDocument: "after" }
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
    { returnDocument: "after" }
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

