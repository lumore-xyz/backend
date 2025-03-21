import express from "express";
import {
  addMessageToSlot,
  addSlotTags,
  createSlot,
  deactivateSlot,
  getSlotById,
  getUserSlots,
  markSlotAsRead,
  updateSlotNotes,
} from "../controllers/slotController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// All routes are protected
router.use(protect);

// Slot management routes
router.post("/create/:matchId", createSlot);
router.get("/", getUserSlots);
router.get("/:slotId", getSlotById);

// Slot chat routes
router.post("/:slotId/messages", addMessageToSlot);
router.post("/:slotId/read", markSlotAsRead);

// Slot organization routes
router.put("/:slotId/notes", updateSlotNotes);
router.post("/:slotId/tags", addSlotTags);
router.post("/:slotId/deactivate", deactivateSlot);

export default router;
