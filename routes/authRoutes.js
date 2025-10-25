// /routes/authRoutes.js
import express from "express";
import rateLimit from "express-rate-limit";
import {
  googleLogin,
  googleLoginWeb,
  isUniqueUsername,
  login,
  refreshToken,
  setPassword,
  signup,
  tma_login,
} from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 });
const router = express.Router();

/**
 * @swagger
 * /api/auth/signup:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 description: Unique username
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *               password:
 *                 type: string
 *                 format: password
 *                 description: User's password
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Invalid input
 *       409:
 *         description: Username or email already exists
 */
router.post("/signup", signup);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login with email and password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *               password:
 *                 type: string
 *                 format: password
 *                 description: User's password
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   description: JWT token
 *       400:
 *         description: Invalid credentials
 *       429:
 *         description: Too many login attempts
 */
router.post("/login", loginLimiter, login);

router.post("/google-signin", googleLogin);
router.post("/google-signin-web", googleLoginWeb);
router.post("/tma-login", tma_login);

router.get("/refresh-token", refreshToken);

/**
 * @swagger
 * /api/auth/set-password:
 *   post:
 *     summary: Set password for Google account
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 format: password
 *                 description: New password
 *     responses:
 *       200:
 *         description: Password set successfully
 *       400:
 *         description: Invalid password
 *       401:
 *         description: Unauthorized
 */
router.post("/set-password", protect, setPassword);

/**
 * @swagger
 * /api/auth/check-username/{username}:
 *   get:
 *     summary: Check if username is unique
 *     tags: [Auth]
 *     parameters:
 *       - in: path
 *         name: username
 *         required: true
 *         schema:
 *           type: string
 *         description: Username to check
 *     responses:
 *       200:
 *         description: Username availability status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isUnique:
 *                   type: boolean
 *                   description: Whether the username is unique
 */
router.get("/check-username/:username", isUniqueUsername);

export default router;
