// /routes/profileRoutes.js
import express from "express";
import rateLimit from "express-rate-limit";
import {
  buySlot,
  createProfile,
  getNextProfile,
  getProfile,
  getRejectionAnalytics,
  getRejectionHistory,
  likeProfile,
  rejectProfile,
  toggleProfileVisibility,
  unlockProfile,
  updateFieldVisibility,
  updateUserPreference,
} from "../controllers/profileController.js";
import { protect } from "../middleware/authMiddleware.js";
import { userControl } from "../middleware/userActionMiddleware.js";

const router = express.Router();

/**
 * @swagger
 * /api/profile/{userId}:
 *   post:
 *     summary: Create a new profile
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               visibleName:
 *                 type: string
 *               hiddenName:
 *                 type: string
 *               gender:
 *                 type: string
 *                 enum: [Male, Female, Non-Binary, Prefer Not to Say]
 *               dob:
 *                 type: string
 *                 format: date
 *               bio:
 *                 type: string
 *               interests:
 *                 type: object
 *                 properties:
 *                   professional:
 *                     type: array
 *                     items:
 *                       type: string
 *                   hobbies:
 *                     type: array
 *                     items:
 *                       type: string
 *               location:
 *                 type: object
 *                 properties:
 *                   type:
 *                     type: string
 *                     enum: [Point]
 *                   coordinates:
 *                     type: array
 *                     items:
 *                       type: number
 *     responses:
 *       200:
 *         description: Profile created successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *   patch:
 *     summary: Update an existing profile
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               visibleName:
 *                 type: string
 *               hiddenName:
 *                 type: string
 *               gender:
 *                 type: string
 *                 enum: [Male, Female, Non-Binary, Prefer Not to Say]
 *               dob:
 *                 type: string
 *                 format: date
 *               bio:
 *                 type: string
 *               interests:
 *                 type: object
 *                 properties:
 *                   professional:
 *                     type: array
 *                     items:
 *                       type: string
 *                   hobbies:
 *                     type: array
 *                     items:
 *                       type: string
 *               location:
 *                 type: object
 *                 properties:
 *                   type:
 *                     type: string
 *                     enum: [Point]
 *                   coordinates:
 *                     type: array
 *                     items:
 *                       type: number
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *   get:
 *     summary: Get user profile
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */

router
  .route("/:userId")
  .post(protect, userControl, createProfile)
  .patch(protect, userControl, createProfile)
  .get(protect, getProfile);

/**
 * @swagger
 * /api/profile/{userId}/visibility:
 *   patch:
 *     summary: Update profile field visibility
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fields:
 *                 type: object
 *                 additionalProperties:
 *                   type: string
 *                   enum: [public, unlocked, private]
 *     responses:
 *       200:
 *         description: Visibility settings updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.patch("/:userId/visibility", protect, updateFieldVisibility);

/**
 * @swagger
 * /api/profile/next:
 *   get:
 *     summary: Get next potential match
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Next profile retrieved successfully
 *       400:
 *         description: Preferences not set
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: No profiles found
 */
const nextProfileLimiter = rateLimit({ windowMs: 3000, max: 1 });
router.get("/next", protect, nextProfileLimiter, getNextProfile);

/**
 * @swagger
 * /api/profile/{userId}/like:
 *   post:
 *     summary: Like a profile and save to slot
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               profileId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile liked and saved to slot
 *       400:
 *         description: No available slots or profile already saved
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User or profile not found
 */
router.post("/:userId/like", protect, likeProfile);

/**
 * @swagger
 * /api/profile/{userId}/reject:
 *   post:
 *     summary: Reject a profile
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               profileId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile rejected successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User or profile not found
 */
router.post("/:userId/reject", protect, rejectProfile);

/**
 * @swagger
 * /api/profile/{userId}/unlock:
 *   post:
 *     summary: Unlock a profile
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               profileId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile unlocked successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.post("/:userId/unlock", protect, unlockProfile);

/**
 * @swagger
 * /api/profile/buy-slot:
 *   post:
 *     summary: Purchase a new slot
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Slot purchased successfully
 *       400:
 *         description: Max slot limit reached
 *       401:
 *         description: Unauthorized
 *       402:
 *         description: Payment failed
 *       404:
 *         description: User not found
 */
router.post("/buy-slot", protect, buySlot);

/**
 * @swagger
 * /api/profile/toggle-visibility/{matchId}:
 *   post:
 *     summary: Toggle profile visibility for a match
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: matchId
 *         required: true
 *         schema:
 *           type: string
 *         description: Match ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isVisible:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Profile visibility updated successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.post("/toggle-visibility/:matchId", toggleProfileVisibility);

router.get("/rejection-history", protect, getRejectionHistory);
router.get("/rejection-analytics", protect, getRejectionAnalytics);

/**
 * @swagger
 * /api/profile/{userId}/preferences:
 *   patch:
 *     summary: Update user preferences
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               interestedIn:
 *                 type: string
 *                 enum: [Men, Women, Non-Binary, Any]
 *               ageRange:
 *                 type: object
 *                 properties:
 *                   min:
 *                     type: number
 *                   max:
 *                     type: number
 *               distance:
 *                 type: number
 *               goal:
 *                 type: object
 *                 properties:
 *                   primary:
 *                     type: string
 *                   secondary:
 *                     type: string
 *                   tertiary:
 *                     type: string
 *               interests:
 *                 type: object
 *                 properties:
 *                   professional:
 *                     type: array
 *                     items:
 *                       type: string
 *                   hobbies:
 *                     type: array
 *                     items:
 *                       type: string
 *               relationshipType:
 *                 type: string
 *               preferredLanguages:
 *                 type: array
 *                 items:
 *                   type: string
 *               zodiacPreference:
 *                 type: array
 *                 items:
 *                   type: string
 *               education:
 *                 type: object
 *                 properties:
 *                   institutions:
 *                     type: array
 *                     items:
 *                       type: string
 *                   minimumDegreeLevel:
 *                     type: string
 *               personalityTypePreference:
 *                 type: array
 *                 items:
 *                   type: string
 *               dietPreference:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Preferences updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.patch(
  "/:userId/preferences",
  protect,
  userControl,
  updateUserPreference
);

export default router;
