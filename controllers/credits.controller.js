import { getCreditBalance } from "../services/creditBalance.service.js";
import { getCreditHistory } from "../services/creditHistory.service.js";
import { grantDailyActiveBonus } from "../services/dailyActiveCredits.service.js";
import { claimRewardedAdCredit } from "../services/rewardedAdCredits.service.js";

export const getCreditsBalance = async (req, res) => {
  const balance = await getCreditBalance(req.user.id);
  if (!balance) {
    return res.status(404).json({ success: false, message: "User not found" });
  }
  return res.status(200).json({ success: true, data: balance });
};

export const getCreditsHistory = async (req, res) => {
  const { page, limit } = req.query;
  const result = await getCreditHistory(req.user.id, page, limit);
  return res.status(200).json({ success: true, ...result });
};

export const claimDailyCredits = async (req, res) => {
  const result = await grantDailyActiveBonus(req.user.id);
  return res.status(200).json({ success: true, data: result });
};

export const claimRewardedAdCreditController = async (req, res) => {
  try {
    const claimId = req.body?.claimId;

    if (typeof claimId !== "string" || !claimId.trim()) {
      return res.status(400).json({
        success: false,
        message: "claimId is required",
      });
    }

    const result = await claimRewardedAdCredit({
      userId: req.user.id,
      claimId,
      now: new Date(),
    });

    if (result.reason === "USER_NOT_FOUND") {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    if (error?.statusCode === 400 || error?.message === "INVALID_CLAIM_ID") {
      return res.status(400).json({
        success: false,
        message: "Invalid claimId",
      });
    }
    throw error;
  }
};

