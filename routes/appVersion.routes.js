import express from "express";
import { getPublicAppVersion } from "../controllers/mobileAppVersion.controller.js";

const router = express.Router();

router.get("/", getPublicAppVersion);

export default router;