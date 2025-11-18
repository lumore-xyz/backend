import express from "express";
import {
  sendNotification,
  subscribe,
  unsubscribe,
} from "../controllers/pushController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/subscribe", protect, subscribe);
router.post("/unsubscribe", protect, unsubscribe);
router.post("/send", protect, sendNotification);

export default router;
