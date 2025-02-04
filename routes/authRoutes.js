// /routes/authRoutes.js
import express from "express";
import rateLimit from "express-rate-limit";
import passport from "passport";
import {
  googleLogin,
  login,
  setPassword,
  signup,
} from "../controllers/authController.js";
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 });

const router = express.Router();

// Local Registration (Signup)
router.post("/signup", signup);

// Local Login
router.post("/login", loginLimiter, login);

// Google OAuth Routes
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// Handle Google OAuth Callback
router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: "/login",
  }),
  googleLogin
);

// Set Password for Google Accounts
router.post("/set-password", setPassword);

export default router;
