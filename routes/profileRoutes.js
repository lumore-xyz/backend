// /routes/profileRoutes.js
import express from "express";
import rateLimit from "express-rate-limit";
import {
  buySlot,
  createProfile,
  getNextProfile,
  getProfile,
  likeProfile,
  rejectProfile,
  unlockProfile,
} from "../controllers/profileController.js";
import { protect } from "../middleware/authMiddleware.js";
import { userControl } from "../middleware/userActionMiddleware.js";

const router = express.Router();

// Create or update profile
router
  .route("/:userId")
  .post(protect, userControl, createProfile) // Create profile
  .patch(protect, userControl, createProfile); // Update profile (PATCH for partial updates)

// Get user profile securely
router.get("/:userId", protect, getProfile);
const nextProfileLimiter = rateLimit({ windowMs: 3000, max: 1 }); // 1 request per 3 seconds
router.get("/next", protect, nextProfileLimiter, getNextProfile);

// Match actions (like, reject, unlock) should target a specific user
router.post("/:userId/like", protect, likeProfile);
router.post("/:userId/reject", protect, rejectProfile);
router.post("/:userId/unlock", protect, unlockProfile);

// Slot management
router.post("/buy-slot", protect, buySlot);

export default router;
