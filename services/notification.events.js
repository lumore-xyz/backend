import socketService from "./socket.service.js";
import { logError } from "../utils/logError.js";

const NOTIFICATION_SOCKET_EVENTS = Object.freeze({
  CREATED: "notification_created",
  UPDATED: "notification_updated",
  DELETED: "notification_deleted",
  UNREAD_COUNT: "notification_unread_count",
});

const safeEmit = (event, userId, payload) => {
  try {
    if (!userId || typeof socketService?.emitToUser !== "function") return;
    socketService.emitToUser(userId, event, payload);
  } catch (error) {
    // Never let socket failures cascade into HTTP errors; notifications are
    // already persisted and the mobile client will pick the change up on
    // its next refetch.
    logError(`[notifications] emit_failed event=${event}`, error);
  }
};

export const emitNotificationCreated = (notification, unreadCount) => {
  emitNotificationWithUnreadCount(
    NOTIFICATION_SOCKET_EVENTS.CREATED,
    notification,
    unreadCount,
  );
};

export const emitNotificationUpdated = (notification, unreadCount) => {
  emitNotificationWithUnreadCount(
    NOTIFICATION_SOCKET_EVENTS.UPDATED,
    notification,
    unreadCount,
  );
};

const emitNotificationWithUnreadCount = (event, notification, unreadCount) => {
  if (!notification?.userId) return;
  safeEmit(event, notification.userId, notification);
  safeEmit(NOTIFICATION_SOCKET_EVENTS.UNREAD_COUNT, notification.userId, {
    unreadCount,
  });
};

export const emitNotificationDeleted = (userId, notificationId) => {
  if (!userId) return;
  safeEmit(NOTIFICATION_SOCKET_EVENTS.DELETED, userId, { id: notificationId });
};

export const emitUnreadCount = (userId, unreadCount) => {
  if (!userId) return;
  safeEmit(NOTIFICATION_SOCKET_EVENTS.UNREAD_COUNT, userId, { unreadCount });
};

export const emitBatchCreated = (grouped) => {
  for (const [userId, items] of grouped.entries()) {
    for (const item of items) {
      safeEmit(NOTIFICATION_SOCKET_EVENTS.CREATED, userId, item);
    }
  }
};
