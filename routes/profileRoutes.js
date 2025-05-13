// /routes/profileRoutes.js
import express from "express";
import {
  createProfile,
  deleteAccount,
  getProfile,
  updateFieldVisibility,
  updateProfilePicture,
  updateUserPreference,
} from "../controllers/profileController.js";
import { protect } from "../middleware/authMiddleware.js";
import { userControl } from "../middleware/userActionMiddleware.js";
import { upload } from "../middleware/upload.js";

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
  .get(protect, getProfile)
  .delete(protect, userControl, deleteAccount);

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


router.patch("/:userId/update-profile-picture",
  protect,
  upload.single("profilePic"),
  updateProfilePicture
);

export default router;
