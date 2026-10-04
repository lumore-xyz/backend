import express from "express";
import {
  completeHaloKyc,
  createHaloKycVerification,
} from "../controllers/halokyc.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/complete", completeHaloKyc);
router.post("/create-verification", protect, createHaloKycVerification);

export default router;
