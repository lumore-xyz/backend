import express from "express";
import {
  claimDailyCredits,
  claimRewardedAdCreditController,
  getCreditsBalance,
  getCreditsHistory,
} from "../controllers/credits.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/balance", protect, getCreditsBalance);
router.get("/history", protect, getCreditsHistory);
router.post("/daily-claim", protect, claimDailyCredits);
router.post("/rewarded-ad-claim", protect, claimRewardedAdCreditController);

export default router;

