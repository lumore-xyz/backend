import express from "express";
import {
  createMatch,
  endMatch,
  findPotentialMatches,
  getActiveMatch,
  getConversationCount,
  getSavedChats,
  toggleProfileVisibility,
} from "../controllers/matchingController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// All routes are protected
router.use(protect);

// Match finding routes
router.get("/potential-matches", findPotentialMatches);
router.post("/create-match/:userId", createMatch);
router.post("/end-match/:userId", endMatch);

// Chat management routes
router.get("/saved-chats", getSavedChats);

// Profile visibility routes
router.post("/toggle-profile-visibility/:matchId", toggleProfileVisibility);

// Active match routes
router.get("/active-match", getActiveMatch);

// Conversation management routes
router.get("/conversation-count", getConversationCount);

export default router;
