import {
  claimRewardedAdCredit,
  getCreditBalance,
  getCreditHistory,
  grantDailyActiveBonus,
} from "../services/credits.service.js";

export const getCreditsBalance = async (req, res) => {
  try {
    const userId = req.user.id;
    const balance = await getCreditBalance(userId);

    if (!balance) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({ success: true, data: balance });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getCreditsHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page, limit } = req.query;
    const result = await getCreditHistory(userId, page, limit);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const claimDailyCredits = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await grantDailyActiveBonus(userId, new Date());
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const claimRewardedAdCreditController = async (req, res) => {
  try {
    const userId = req.user.id;
    const claimId = req.body?.claimId;

    if (typeof claimId !== "string" || !claimId.trim()) {
      return res.status(400).json({
        success: false,
        message: "claimId is required",
      });
    }

    const result = await claimRewardedAdCredit({
      userId,
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
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

