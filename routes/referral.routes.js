import express from "express";
import {
  applyReferralCode,
  getReferralSummary,
} from "../controllers/referral.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);

router.get("/summary", getReferralSummary);
router.post("/apply", applyReferralCode);

export default router;
