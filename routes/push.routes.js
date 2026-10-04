import express from "express";
import {
  sendNotification,
  subscribe,
  unsubscribe,
} from "../controllers/push.controller.js";

import { protect } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/admin.middleware.js";

const router = express.Router();

router.use(protect);

router.post("/subscribe", subscribe);
router.post("/unsubscribe", unsubscribe);
router.post("/send", requireAdmin, sendNotification);

export default router;
