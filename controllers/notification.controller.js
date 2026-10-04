import {
  deleteNotification,
  getUnreadCount,
  getUserNotifications,
  markAllAsRead,
  markAsRead,
} from "../services/notification.service.js";
import { handleNotificationControllerError } from "../utils/notificationError.js";

export const listNotifications = async (req, res) => {
  try {
    const userId = req.user?._id;
    const page = req.query.page;
    const limit = req.query.limit;
    const unreadOnly = String(req.query.unreadOnly || "").toLowerCase() === "true";

    const result = await getUserNotifications(userId, { page, limit, unreadOnly });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return handleNotificationControllerError(res, error);
  }
};

export const getUnreadCountController = async (req, res) => {
  try {
    const userId = req.user?._id;
    const unreadCount = await getUnreadCount(userId);
    return res.status(200).json({ success: true, unreadCount });
  } catch (error) {
    return handleNotificationControllerError(res, error);
  }
};

export const markNotificationRead = async (req, res) => {
  try {
    const userId = req.user?._id;
    const updated = await markAsRead(userId, req.params.id);
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }
    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    return handleNotificationControllerError(res, error);
  }
};

export const markAllNotificationsRead = async (req, res) => {
  try {
    const userId = req.user?._id;
    const result = await markAllAsRead(userId);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return handleNotificationControllerError(res, error);
  }
};

export const removeNotification = async (req, res) => {
  try {
    const userId = req.user?._id;
    const result = await deleteNotification(userId, req.params.id);
    if (!result.deleted) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }
    return res.status(200).json({ success: true, deleted: true });
  } catch (error) {
    return handleNotificationControllerError(res, error);
  }
};
