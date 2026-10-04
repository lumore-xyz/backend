import User from "../models/user.model.js";
import { isVerifiedUser } from "../utils/verification.js";
import { CREDIT_RULES } from "./creditRules.js";
import { CREDIT_LEDGER_TYPE } from "../utils/creditLedger.js";
import { awardCredits } from "./creditAward.service.js";
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

  if (!isVerifiedUser(referredUser)) {
    return { granted: false, reason: "REFERRED_USER_NOT_VERIFIED" };
  }

  const referrer = await User.findById(referredUser.referredBy)
    .select("_id username isVerified verificationStatus")
    .lean();

  if (!referrer) {
    return { granted: false, reason: "REFERRER_NOT_FOUND" };
  }

  if (!isVerifiedUser(referrer)) {
    return { granted: false, reason: "REFERRER_NOT_VERIFIED" };
  }

  const result = await awardCredits({
    userId: referrer._id,
    amount: CREDIT_RULES.REFERRAL_VERIFICATION_BONUS,
    type: CREDIT_LEDGER_TYPE.REFERRAL_BONUS,
    referenceType: "user",
    referenceId: referredUser._id.toString(),
    meta: {
      referralCode: referrer.username,
      referredUserId: referredUser._id.toString(),
      referredUsername: referredUser.username,
      awardedAt: now.toISOString(),
    },
  });
  if (!result.granted) {
    return {
      ...result,
      reason: result.reason === "USER_NOT_FOUND" ? "REFERRER_NOT_FOUND" : result.reason,
    };
  }

  return {
    granted: true,
    credits: result.credits,
    referrerId: referrer._id.toString(),
    referredUserId: referredUser._id.toString(),
  };
};

