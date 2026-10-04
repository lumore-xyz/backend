import CreditLedger from "../models/creditLedger.model.js";
import User from "../models/user.model.js";
import { CREDIT_LEDGER_TYPE } from "../utils/creditLedger.js";
import { isVerifiedUser, VERIFICATION_STATUS } from "../utils/verification.js";
import { awardReferralBonusForVerifiedUser } from "./referralCredits.service.js";
import { CREDIT_RULES } from "./creditRules.js";

export const getReferralSummaryData = async (userId) => {
  const user = await User.findById(userId)
    .select("_id username isVerified verificationStatus referredBy")
    .lean();
  if (!user) return null;

  const [referredTotal, referredVerified, rewardsEarned, referredByUser] =
    await Promise.all([
      User.countDocuments({ referredBy: userId }),
      User.countDocuments({
        referredBy: userId,
        $or: [
          { isVerified: true },
          { verificationStatus: VERIFICATION_STATUS.APPROVED },
        ],
      }),
      CreditLedger.countDocuments({
        user: userId,
        type: CREDIT_LEDGER_TYPE.REFERRAL_BONUS,
      }),
      user.referredBy
        ? User.findById(user.referredBy).select("username").lean()
        : Promise.resolve(null),
    ]);

  return {
    canAccess: isVerifiedUser(user),
    referralCode: user.username,
    referredBy: referredByUser?.username || null,
    referralRewardCredits: CREDIT_RULES.REFERRAL_VERIFICATION_BONUS,
    stats: { referredTotal, referredVerified, rewardsEarned },
  };
};

export const applyReferralCode = async ({ userId, code }) => {
  const user = await User.findById(userId)
    .select("_id username isVerified verificationStatus referredBy createdAt")
    .lean();
  if (!user) return { error: "USER_NOT_FOUND" };
  if (user.referredBy) return { error: "ALREADY_APPLIED" };
  if (code === user.username?.toLowerCase()) return { error: "OWN_CODE" };

  const referrer = await User.findOne({ username: code })
    .select("_id username isVerified verificationStatus createdAt")
    .lean();
  if (!referrer || !isVerifiedUser(referrer)) return { error: "INVALID_CODE" };

  const referredCreatedAt = user.createdAt ? new Date(user.createdAt) : null;
  const referrerCreatedAt = referrer.createdAt ? new Date(referrer.createdAt) : null;
  if (
    referredCreatedAt &&
    referrerCreatedAt &&
    referredCreatedAt <= referrerCreatedAt
  ) {
    return { error: "REFERRER_NOT_OLDER" };
  }

  const applied = await User.findOneAndUpdate(
    { _id: userId, referredBy: null },
    { $set: { referredBy: referrer._id } },
    { returnDocument: "after" },
  )
    .select("_id referredBy")
    .lean();
  if (!applied) return { error: "ALREADY_APPLIED" };

  const reward = await awardReferralBonusForVerifiedUser({
    referredUserId: userId,
  });
  return { referredBy: referrer.username, rewardGranted: reward.granted };
};
