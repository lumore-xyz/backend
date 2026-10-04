import {
  createManyNotifications,
  createNotification,
} from "../services/notification.service.js";
import { handleNotificationControllerError } from "../utils/notificationError.js";

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
    return handleNotificationControllerError(res, error);
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
    return handleNotificationControllerError(res, error);
  }
};
