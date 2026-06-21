import express from "express";

import {
  adminCreateBulkSystemNotifications,
  adminCreateSystemNotification,
  getUnreadCountController,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  removeNotification,
} from "../controllers/notification.controller.js";
import { requireAdmin } from "../middleware/admin.middleware.js";
import { protect } from "../middleware/auth.middleware.js";
import { validateObjectIdParam } from "../middleware/validate.middleware.js";

const router = express.Router();

router.use(protect);

router.get("/", listNotifications);
router.get("/unread-count", getUnreadCountController);
router.patch("/read-all", markAllNotificationsRead);
router.patch("/:id/read", validateObjectIdParam("id"), markNotificationRead);
router.delete("/:id", validateObjectIdParam("id"), removeNotification);

export const adminNotificationRouter = express.Router();
adminNotificationRouter.use(protect, requireAdmin);
adminNotificationRouter.post("/system", adminCreateSystemNotification);
adminNotificationRouter.post(
  "/system/bulk",
  adminCreateBulkSystemNotifications,
);

export default router;
