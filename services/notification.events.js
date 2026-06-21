import socketService from "./socket.service.js";

export const NOTIFICATION_SOCKET_EVENTS = Object.freeze({
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
    console.error(
      `[notifications] emit_failed event=${event}`,
      error?.message || error,
    );
  }
};

export const emitNotificationCreated = (notification, unreadCount) => {
  if (!notification?.userId) return;
  safeEmit(NOTIFICATION_SOCKET_EVENTS.CREATED, notification.userId, notification);
  safeEmit(NOTIFICATION_SOCKET_EVENTS.UNREAD_COUNT, notification.userId, {
    unreadCount,
  });
};

export const emitNotificationUpdated = (notification, unreadCount) => {
  if (!notification?.userId) return;
  safeEmit(NOTIFICATION_SOCKET_EVENTS.UPDATED, notification.userId, notification);
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
