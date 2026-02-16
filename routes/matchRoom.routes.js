import express from "express";

import {
  getReceivedFeedbacks,
  getInbox,
  getRoomData,
  reportChatUser,
  submitChatFeedback,
} from "../controllers/matchRoom.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { validateObjectIdParam } from "../middleware/validate.middleware.js";

const router = express.Router();

router.get("/", protect, getInbox);
router.get("/feedback/received", protect, getReceivedFeedbacks);
router.get("/:roomId", protect, validateObjectIdParam("roomId"), getRoomData);
router.post(
  "/:roomId/feedback",
  protect,
  validateObjectIdParam("roomId"),
  submitChatFeedback
);
router.post(
  "/:roomId/report",
  protect,
  validateObjectIdParam("roomId"),
  reportChatUser
);

export default router;
