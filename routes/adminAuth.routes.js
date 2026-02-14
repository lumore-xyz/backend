import express from "express";
import rateLimit from "express-rate-limit";
import { adminGoogleLoginWeb } from "../controllers/adminAuth.controller.js";

const router = express.Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

router.post("/google-signin-web", loginLimiter, adminGoogleLoginWeb);

export default router;

