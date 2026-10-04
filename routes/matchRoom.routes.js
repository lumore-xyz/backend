import express from "express";

import {
  getInbox,
  getRoomData,
} from "../controllers/matchRoom.controller.js";
import {
  getReceivedFeedbacks,
  submitChatFeedback,
} from "../controllers/chatFeedback.controller.js";
import { reportChatUser } from "../controllers/chatReport.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { validateObjectIdParam } from "../middleware/validate.middleware.js";

const router = express.Router();

router.use(protect);
router.param("roomId", validateObjectIdParam("roomId"));

router.get("/", getInbox);
router.get("/feedback/received", getReceivedFeedbacks);
router.get("/:roomId", getRoomData);
router.post(
  "/:roomId/feedback",
  submitChatFeedback
);
router.post(
  "/:roomId/report",
  reportChatUser
);

export default router;
