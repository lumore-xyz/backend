import express from "express";
import { appStatus } from "../controllers/status.controller.js";
import { getPublicMobileConfig } from "../controllers/mobileRuntimeConfig.controller.js";
import {
  getPublicOptions,
  getPublicOptionsVersion,
} from "../controllers/options.controller.js";
const router = express.Router();

router.get("/app-status", appStatus);
router.get("/options", getPublicOptions);
router.get(["/options/meta", "/options-version"], getPublicOptionsVersion);
router.get("/mobile-config", getPublicMobileConfig);

export default router;
