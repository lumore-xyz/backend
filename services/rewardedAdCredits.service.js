import CreditLedger from "../models/creditLedger.model.js";
import User from "../models/user.model.js";
import { CREDIT_RULES } from "./creditRules.js";
import { CREDIT_LEDGER_TYPE } from "../utils/creditLedger.js";
const getRewardedAdWindowStart = (date = new Date()) =>
  new Date(date.getTime() - CREDIT_RULES.REWARDED_AD_WINDOW_MS);

const rollbackRewardedAdClaim = async (userId, ledgerEntry) => {
  if (ledgerEntry) await CreditLedger.deleteOne({ _id: ledgerEntry._id });
  await User.findByIdAndUpdate(userId, {
    $inc: { credits: -CREDIT_RULES.REWARDED_AD_CREDIT },
  });
};

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

export const getRewardedAdQuota = async (userId, now = new Date()) => {
  const windowStart = getRewardedAdWindowStart(now);
  const claims = await CreditLedger.find({
    user: userId,
    type: CREDIT_LEDGER_TYPE.REWARDED_AD_WATCH,
    createdAt: { $gt: windowStart },
  })
    .select("createdAt")
    .sort({ createdAt: 1 })
    .lean();

  return getRewardedAdQuotaFromClaims(claims, now);
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
    type: CREDIT_LEDGER_TYPE.REWARDED_AD_WATCH,
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

  let ledgerEntry = null;
  let creditReverted = false;
  try {
    ledgerEntry = await CreditLedger.create({
      user: userId,
      amount: CREDIT_RULES.REWARDED_AD_CREDIT,
      type: CREDIT_LEDGER_TYPE.REWARDED_AD_WATCH,
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
      await rollbackRewardedAdClaim(userId, ledgerEntry);
      ledgerEntry = null;
      creditReverted = true;

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
    if (!creditReverted) {
      await rollbackRewardedAdClaim(userId, ledgerEntry);
    }

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

