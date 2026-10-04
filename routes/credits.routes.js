import express from "express";
import {
  claimDailyCredits,
  claimRewardedAdCreditController,
  getCreditsBalance,
  getCreditsHistory,
} from "../controllers/credits.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);

router.get("/balance", getCreditsBalance);
router.get("/history", getCreditsHistory);
router.post("/daily-claim", claimDailyCredits);
router.post("/rewarded-ad-claim", claimRewardedAdCreditController);

export default router;

