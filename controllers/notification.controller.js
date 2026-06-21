import {
  createManyNotifications,
  createNotification,
  deleteNotification,
  getUnreadCount,
  getUserNotifications,
  markAllAsRead,
  markAsRead,
} from "../services/notification.service.js";

const handleError = (res, error, fallbackMessage = "Server error") => {
  console.error("[notifications] controller error:", error);
  const message = error?.message || fallbackMessage;
  return res.status(500).json({ success: false, message });
};

export const listNotifications = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const page = req.query.page;
    const limit = req.query.limit;
    const unreadOnly = String(req.query.unreadOnly || "").toLowerCase() === "true";

    const result = await getUserNotifications(userId, { page, limit, unreadOnly });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return handleError(res, error);
  }
};

export const getUnreadCountController = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const unreadCount = await getUnreadCount(userId);
    return res.status(200).json({ success: true, unreadCount });
  } catch (error) {
    return handleError(res, error);
  }
};

export const markNotificationRead = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const updated = await markAsRead(userId, req.params.id);
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }
    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    return handleError(res, error);
  }
};

export const markAllNotificationsRead = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const result = await markAllAsRead(userId);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return handleError(res, error);
  }
};

export const removeNotification = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const result = await deleteNotification(userId, req.params.id);
    if (!result.deleted) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }
    return res.status(200).json({ success: true, deleted: true });
  } catch (error) {
    return handleError(res, error);
  }
};

export const adminCreateSystemNotification = async (req, res) => {
  try {
    const { userId, type, title, message, entityType, entityId, metadata } =
      req.body || {};

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required",
      });
    }

    const created = await createNotification({
      userId,
      actorId: req.user?._id,
      type: type || "SYSTEM_MESSAGE",
      title,
      message,
      entityType,
      entityId,
      metadata,
    });

    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return handleError(res, error);
  }
};

export const adminCreateBulkSystemNotifications = async (req, res) => {
  try {
    const { userIds, type, title, message, entityType, entityId, metadata } =
      req.body || {};

    if (!Array.isArray(userIds) || !userIds.length) {
      return res.status(400).json({
        success: false,
        message: "userIds must be a non-empty array",
      });
    }

    const inputs = userIds.map((userId) => ({
      userId,
      actorId: req.user?._id,
      type: type || "SYSTEM_MESSAGE",
      title,
      message,
      entityType,
      entityId,
      metadata,
    }));

    const created = await createManyNotifications(inputs);
    return res.status(201).json({
      success: true,
      count: created.length,
      data: created,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export default {
  listNotifications,
  getUnreadCountController,
  markNotificationRead,
  markAllNotificationsRead,
  removeNotification,
  adminCreateSystemNotification,
  adminCreateBulkSystemNotifications,
};
