import express from "express";
import { adminGoogleLoginWeb } from "../controllers/adminAuth.controller.js";
import { createRateLimiter } from "../middleware/rateLimit.middleware.js";

const router = express.Router();
const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });

router.post("/google-signin-web", loginLimiter, adminGoogleLoginWeb);

export default router;

