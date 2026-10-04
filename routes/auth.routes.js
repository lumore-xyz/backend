import express from "express";
import {
  googleLogin,
  googleLoginWeb,
  isUniqueUsername,
  login,
  refreshToken,
  signup,
  tma_login,
} from "../controllers/auth.controller.js";
import {
  forgotPassword,
  resetPassword,
  setPassword,
} from "../controllers/password.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { createRateLimiter } from "../middleware/rateLimit.middleware.js";

const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
const signupLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
const forgotPasswordLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
const resetPasswordLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
const router = express.Router();

router.post("/signup", signupLimiter, signup);

router.post("/login", loginLimiter, login);
router.post("/forgot-password", forgotPasswordLimiter, forgotPassword);
router.post("/reset-password", resetPasswordLimiter, resetPassword);

router.post("/google-signin", googleLogin);
router.post("/google-signin-web", googleLoginWeb);
router.post("/tma-login", tma_login);

router.post("/refresh-token", refreshToken);

router.post("/set-password", protect, setPassword);

router.get("/check-username/:username", isUniqueUsername);

export default router;
