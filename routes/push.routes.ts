import express from "express";
import {
  sendNotification,
  subscribe,
  unsubscribe,
} from "../controllers/push.controller.js";

import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/subscribe", protect, subscribe);
router.post("/unsubscribe", protect, unsubscribe);
router.post("/send", protect, sendNotification);

export default router;
