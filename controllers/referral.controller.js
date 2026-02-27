import { CREDIT_RULES, awardReferralBonusForVerifiedUser } from "../services/credits.service.js";
import CreditLedger from "../models/creditLedger.model.js";
import User from "../models/user.model.js";

const isUserVerified = (user) =>
  Boolean(user?.isVerified || user?.verificationStatus === "approved");

const getFrontendBaseUrl = () =>
  (process.env.FRONTEND_URL || "https://lumore.xyz").replace(/\/+$/, "");

export const getReferralSummary = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId)
      .select("_id username isVerified verificationStatus referredBy createdAt")
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const [referredTotal, referredVerified, rewardsEarned, referredByUser] =
      await Promise.all([
        User.countDocuments({ referredBy: userId }),
        User.countDocuments({
          referredBy: userId,
          $or: [{ isVerified: true }, { verificationStatus: "approved" }],
        }),
        CreditLedger.countDocuments({ user: userId, type: "referral_bonus" }),
        user.referredBy
          ? User.findById(user.referredBy).select("username").lean()
          : Promise.resolve(null),
      ]);

    return res.status(200).json({
      success: true,
      data: {
        canAccess: isUserVerified(user),
        referralCode: user.username,
        referralLink: `${getFrontendBaseUrl()}/app/referral?code=${encodeURIComponent(
          user.username
        )}`,
        referralRewardCredits: CREDIT_RULES.REFERRAL_VERIFICATION_BONUS,
        referredBy: referredByUser?.username || null,
        stats: {
          referredTotal,
          referredVerified,
          rewardsEarned,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const applyReferralCode = async (req, res) => {
  try {
    const userId = req.user.id;
    const rawCode = String(req.body?.code || "");
    const code = rawCode.trim().toLowerCase();

    if (!code) {
      return res
        .status(400)
        .json({ success: false, message: "Referral code is required" });
    }

    const user = await User.findById(userId)
      .select("_id username isVerified verificationStatus referredBy")
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.referredBy) {
      return res.status(409).json({
        success: false,
        message: "Referral code already applied",
      });
    }

    if (code === user.username?.toLowerCase()) {
      return res.status(400).json({
        success: false,
        message: "You cannot use your own referral code",
      });
    }

    const referrer = await User.findOne({ username: code })
      .select("_id username isVerified verificationStatus createdAt")
      .lean();

    if (!referrer) {
      return res
        .status(404)
        .json({ success: false, message: "Invalid referral code" });
    }

    if (!isUserVerified(referrer)) {
      return res.status(404).json({
        success: false,
        message: "Invalid referral code",
      });
    }

    const referredCreatedAt = user.createdAt ? new Date(user.createdAt) : null;
    const referrerCreatedAt = referrer.createdAt ? new Date(referrer.createdAt) : null;
    if (
      referredCreatedAt &&
      referrerCreatedAt &&
      referredCreatedAt <= referrerCreatedAt
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Referral code can be used only from users who joined before you",
      });
    }

    const applied = await User.findOneAndUpdate(
      { _id: userId, referredBy: null },
      { $set: { referredBy: referrer._id } },
      { returnDocument: "after" }
    )
      .select("_id referredBy")
      .lean();

    if (!applied) {
      return res.status(409).json({
        success: false,
        message: "Referral code already applied",
      });
    }

    const reward = await awardReferralBonusForVerifiedUser({
      referredUserId: userId,
      now: new Date(),
    });

    return res.status(200).json({
      success: true,
      data: {
        referredBy: referrer.username,
        rewardGranted: reward.granted,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

