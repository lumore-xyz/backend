import express from "express";
import {
  applyReferralCode,
  getReferralSummary,
} from "../controllers/referral.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/summary", protect, getReferralSummary);
router.post("/apply", protect, applyReferralCode);

export default router;
