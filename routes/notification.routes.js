import express from "express";

import {
  getUnreadCountController,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  removeNotification,
} from "../controllers/notification.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { validateObjectIdParam } from "../middleware/validate.middleware.js";

const router = express.Router();

router.use(protect);
router.param("id", validateObjectIdParam("id"));

router.get("/", listNotifications);
router.get("/unread-count", getUnreadCountController);
router.patch("/read-all", markAllNotificationsRead);
router.patch("/:id/read", markNotificationRead);
router.delete("/:id", removeNotification);

export default router;
