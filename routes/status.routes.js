import express from "express";
import { appStatus, preferenceMatchCount } from "../controllers/status.controller.js";
import { protect } from "../middleware/auth.middleware.js";
const router = express.Router();

router.get("/app-status", appStatus);
router.get("/match-available-count", protect, preferenceMatchCount);

export default router;
