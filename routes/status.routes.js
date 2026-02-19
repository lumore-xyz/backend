import express from "express";
import { appStatus, preferenceMatchCount } from "../controllers/status.controller.js";
import {
  getPublicOptions,
  getPublicOptionsVersion,
} from "../controllers/options.controller.js";
import { protect } from "../middleware/auth.middleware.js";
const router = express.Router();

router.get("/app-status", appStatus);
router.get("/match-available-count", protect, preferenceMatchCount);
router.get("/options", getPublicOptions);
router.get("/options/meta", getPublicOptionsVersion);
router.get("/options-version", getPublicOptionsVersion);

export default router;
