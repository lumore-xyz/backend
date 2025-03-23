import express from "express";
import {
  createMatch,
  endMatch,
  findPotentialMatches,
  getActiveMatch,
  rejectProfile,
} from "../controllers/matchingController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// All routes are protected
router.use(protect);

/**
 * @swagger
 * /api/matching/potential-matches:
 *   get:
 *     summary: Find potential matches for a user
 *     tags: [Matching]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of potential matches
 *       400:
 *         description: Daily conversation limit reached
 *       401:
 *         description: Unauthorized
 */
router.get("/potential-matches", findPotentialMatches);

/**
 * @swagger
 * /api/matching/create-match/{userId}:
 *   post:
 *     summary: Create a match between two users
 *     tags: [Matching]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to match with
 *     responses:
 *       200:
 *         description: Match created successfully
 *       400:
 *         description: One or both users already in a match
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: One or both users not found
 */
router.post("/create-match/:userId", createMatch);

/**
 * @swagger
 * /api/matching/end-match/{userId}:
 *   post:
 *     summary: End a match between two users
 *     tags: [Matching]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to end match with
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for ending the match (optional)
 *     responses:
 *       200:
 *         description: Match ended successfully
 *       400:
 *         description: Users are not currently matched
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: One or both users not found
 */
router.post("/end-match/:userId", endMatch);

/**
 * @swagger
 * /api/matching/active-match:
 *   get:
 *     summary: Get user's active match
 *     tags: [Matching]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Active match details
 *       401:
 *         description: Unauthorized
 */
router.get("/active-match", getActiveMatch);

/**
 * @swagger
 * /api/matching/reject-profile/{userId}:
 *   post:
 *     summary: Reject a profile
 *     tags: [Matching]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to reject
 *     responses:
 *       200:
 *         description: Profile rejected successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.post("/reject-profile/:userId", rejectProfile);

export default router;
