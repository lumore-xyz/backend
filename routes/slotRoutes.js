import express from "express";
import {
  createSlot,
  getSlot,
  getSlots,
  updateSlot,
} from "../controllers/slotController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Create a new slot
router.post("/", protect, createSlot);

// Get all slots for the authenticated user
router.get("/", protect, getSlots);

// Get a single slot
router.get("/:slotId", protect, getSlot);

// Update a slot
router.patch("/:slotId", protect, updateSlot);

export default router;
