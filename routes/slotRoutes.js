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

/**
 * @swagger
 * /api/slots/create/{matchId}:
 *   post:
 *     summary: Create a new slot for a match
 *     tags: [Slots]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: matchId
 *         required: true
 *         schema:
 *           type: string
 *         description: Match ID to create slot for
 *     responses:
 *       200:
 *         description: Slot created successfully
 *       400:
 *         description: No available slots
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Match not found
 */
router.post("/create/:matchId", createSlot);

/**
 * @swagger
 * /api/slots:
 *   get:
 *     summary: Get all slots for the current user
 *     tags: [Slots]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user's slots
 *       401:
 *         description: Unauthorized
 */
router.get("/", getUserSlots);

/**
 * @swagger
 * /api/slots/{slotId}:
 *   get:
 *     summary: Get a specific slot by ID
 *     tags: [Slots]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slotId
 *         required: true
 *         schema:
 *           type: string
 *         description: Slot ID
 *     responses:
 *       200:
 *         description: Slot details
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Slot not found
 */
router.get("/:slotId", getSlotById);

/**
 * @swagger
 * /api/slots/{slotId}/messages:
 *   post:
 *     summary: Add a message to a slot
 *     tags: [Slots]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slotId
 *         required: true
 *         schema:
 *           type: string
 *         description: Slot ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *                 description: Message content
 *     responses:
 *       200:
 *         description: Message added successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Slot not found
 */
router.post("/:slotId/messages", addMessageToSlot);

/**
 * @swagger
 * /api/slots/{slotId}/read:
 *   post:
 *     summary: Mark a slot as read
 *     tags: [Slots]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slotId
 *         required: true
 *         schema:
 *           type: string
 *         description: Slot ID
 *     responses:
 *       200:
 *         description: Slot marked as read
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Slot not found
 */
router.post("/:slotId/read", markSlotAsRead);

/**
 * @swagger
 * /api/slots/{slotId}/notes:
 *   put:
 *     summary: Update notes for a slot
 *     tags: [Slots]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slotId
 *         required: true
 *         schema:
 *           type: string
 *         description: Slot ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *                 description: Notes content
 *     responses:
 *       200:
 *         description: Notes updated successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Slot not found
 */
router.put("/:slotId/notes", updateSlotNotes);

/**
 * @swagger
 * /api/slots/{slotId}/tags:
 *   post:
 *     summary: Add tags to a slot
 *     tags: [Slots]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slotId
 *         required: true
 *         schema:
 *           type: string
 *         description: Slot ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of tags
 *     responses:
 *       200:
 *         description: Tags added successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Slot not found
 */
router.post("/:slotId/tags", addSlotTags);

/**
 * @swagger
 * /api/slots/{slotId}/deactivate:
 *   post:
 *     summary: Deactivate a slot
 *     tags: [Slots]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slotId
 *         required: true
 *         schema:
 *           type: string
 *         description: Slot ID
 *     responses:
 *       200:
 *         description: Slot deactivated successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Slot not found
 */
router.post("/:slotId/deactivate", deactivateSlot);

export default router;
