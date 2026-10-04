import { normalizeString } from "../utils/strings.js";
import {
  applyReferralCode as applyReferralCodeService,
  getReferralSummaryData,
} from "../services/referral.service.js";

const getFrontendBaseUrl = () =>
  (process.env.FRONTEND_URL || "https://lumore.xyz").replace(/\/+$/, "");

export const getReferralSummary = async (req, res) => {
  const userId = req.user.id;
  const data = await getReferralSummaryData(userId);
  if (!data) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  return res.status(200).json({
    success: true,
    data: {
      ...data,
      referralLink: `${getFrontendBaseUrl()}/app/referral?code=${encodeURIComponent(
        data.referralCode,
      )}`,
    },
  });
};

export const applyReferralCode = async (req, res) => {
  const userId = req.user.id;
  const rawCode = String(req.body?.code || "");
  const code = normalizeString(rawCode);

  if (!code) {
    return res
      .status(400)
      .json({ success: false, message: "Referral code is required" });
  }

  const result = await applyReferralCodeService({ userId, code });
  if (result.error === "USER_NOT_FOUND") {
    return res.status(404).json({ success: false, message: "User not found" });
  }
  if (result.error === "ALREADY_APPLIED") {
    return res.status(409).json({
      success: false,
      message: "Referral code already applied",
    });
  }

  if (result.error === "OWN_CODE") {
    return res.status(400).json({
      success: false,
      message: "You cannot use your own referral code",
    });
  }

  if (result.error === "INVALID_CODE") {
    return res.status(404).json({
      success: false,
      message: "Invalid referral code",
    });
  }

  if (result.error === "REFERRER_NOT_OLDER") {
    return res.status(400).json({
      success: false,
      message:
        "Referral code can be used only from users who joined before you",
    });
  }

  return res.status(200).json({
    success: true,
    data: {
      referredBy: result.referredBy,
      rewardGranted: result.rewardGranted,
    },
  });
};

