import Notification from "../models/notification.model.js";
import {
  buildNotificationDoc,
  buildObjectId,
  clampPagination,
  isValidObjectId,
  normalizeNotificationPayload,
} from "./notification.helpers.js";
import {
  emitBatchCreated,
  emitNotificationCreated,
  emitNotificationDeleted,
  emitNotificationUpdated,
  emitUnreadCount,
  NOTIFICATION_SOCKET_EVENTS,
} from "./notification.events.js";
import {
  buildCommunityInviteNotification,
  buildCommunityJoinedNotification,
  buildCommunityMatchNotification,
  buildCommunityRoleUpdatedNotification,
  buildFeedbackNotification,
  buildGameSubmissionNotification,
  buildMatchNotification,
  buildSystemMessageNotification,
} from "./notification.templates.js";

const safeInput = (input) =>
  input && typeof input === "object" ? input : null;

const safeInputArray = (inputs) =>
  Array.isArray(inputs) ? inputs.filter((item) => safeInput(item)) : [];

/**
 * Persist a notification, idempotently. If a notification already exists for
 * (userId, type, entityType, entityId), the existing row is returned instead
 * of inserting a duplicate. This lets event publishers safely retry without
 * flooding the recipient.
 */
const persistNotification = async (doc) => {
  if (!doc?.entityType || !doc?.entityId) {
    const created = await Notification.create(doc);
    return { doc: created.toObject(), created: true };
  }

  const result = await Notification.findOneAndUpdate(
    {
      userId: doc.userId,
      type: doc.type,
      entityType: doc.entityType,
      entityId: doc.entityId,
    },
    { $setOnInsert: doc },
    {
      returnDocument: "after",
      upsert: true,
      includeResultMetadata: true,
      setDefaultsOnInsert: true,
    },
  );

  const created = !result?.lastErrorObject?.updatedExisting;
  return { doc: result?.value?.toObject?.() || result?.value, created };
};

export const createNotification = async (input) => {
  const safe = safeInput(input);
  if (!safe) throw new Error("createNotification requires an input object");

  const doc = buildNotificationDoc(safe);
  const { doc: saved, created } = await persistNotification(doc);
  const formatted = normalizeNotificationPayload(saved);

  // Only fire a "new notification" socket event if we actually inserted one.
  if (created) {
    const unreadCount = await getUnreadCount(formatted.userId);
    emitNotificationCreated(formatted, unreadCount);
  }
  return formatted;
};

export const createManyNotifications = async (inputs = []) => {
  const safeInputs = safeInputArray(inputs);
  if (!safeInputs.length) return [];

  const built = safeInputs
    .map((item) => {
      try {
        return buildNotificationDoc(item);
      } catch (error) {
        console.error(
          "[notifications] createMany skipped entry:",
          error?.message || error,
        );
        return null;
      }
    })
    .filter(Boolean);

  if (!built.length) return [];

  // Use ordered:false so one bad doc doesn't abort the batch; dedup relies on
  // the partial unique index plus upsert fallback in persistNotification when
  // an entityId is present.
  const createdDocs = await Notification.insertMany(built, { ordered: false });
  const formatted = createdDocs.map(normalizeNotificationPayload);

  // Group by userId so we can batch unread counts in a single aggregation.
  const grouped = new Map();
  for (const item of formatted) {
    if (!grouped.has(item.userId)) grouped.set(item.userId, []);
    grouped.get(item.userId).push(item);
  }

  const unreadCounts = await Notification.aggregate([
    {
      $match: {
        userId: { $in: Array.from(grouped.keys()) },
        isRead: false,
      },
    },
    { $group: { _id: "$userId", count: { $sum: 1 } } },
  ]);
  const unreadByUser = new Map(
    unreadCounts.map((row) => [row._id.toString(), row.count]),
  );

  emitBatchCreated(grouped);
  for (const [userId] of grouped.entries()) {
    emitUnreadCount(userId, unreadByUser.get(userId) || 0);
  }

  return formatted;
};

export const getUserNotifications = async (
  userId,
  { page, limit, unreadOnly } = {},
) => {
  if (!isValidObjectId(userId)) {
    throw new Error("userId is required to fetch notifications");
  }

  const { page: safePage, limit: safeLimit } = clampPagination({ page, limit });
  const userObjectId = buildObjectId(userId);
  const filter = { userId: userObjectId };
  if (unreadOnly) filter.isRead = false;

  const skip = (safePage - 1) * safeLimit;
  const [docs, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ userId: userObjectId, isRead: false }),
  ]);

  return {
    data: docs.map((doc) => normalizeNotificationPayload({ ...doc, _id: doc._id })),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      hasMore: skip + docs.length < total,
    },
    unreadCount,
  };
};

export const getUnreadCount = async (userId) => {
  if (!isValidObjectId(userId)) return 0;
  return await Notification.countDocuments({
    userId: buildObjectId(userId),
    isRead: false,
  });
};

export const markAsRead = async (userId, notificationId) => {
  if (!isValidObjectId(userId) || !isValidObjectId(notificationId)) {
    return null;
  }

  const updated = await Notification.findOneAndUpdate(
    {
      _id: buildObjectId(notificationId),
      userId: buildObjectId(userId),
    },
    { $set: { isRead: true, readAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!updated) return null;

  const formatted = normalizeNotificationPayload(updated);
  const unreadCount = await getUnreadCount(userId);
  emitNotificationUpdated(formatted, unreadCount);
  return formatted;
};

export const markAllAsRead = async (userId) => {
  if (!isValidObjectId(userId)) return { modifiedCount: 0 };
  const result = await Notification.updateMany(
    { userId: buildObjectId(userId), isRead: false },
    { $set: { isRead: true, readAt: new Date() } },
  );
  emitUnreadCount(userId, 0);
  return { modifiedCount: result?.modifiedCount || 0 };
};

export const deleteNotification = async (userId, notificationId) => {
  if (!isValidObjectId(userId) || !isValidObjectId(notificationId)) {
    return { deleted: false };
  }
  const result = await Notification.findOneAndDelete({
    _id: buildObjectId(notificationId),
    userId: buildObjectId(userId),
  });
  if (!result) return { deleted: false };

  const unreadCount = await getUnreadCount(userId);
  emitNotificationDeleted(userId, result._id.toString());
  emitUnreadCount(userId, unreadCount);
  return { deleted: true };
};

/* -------------------------------------------------------------------------- */
/*                       Typed domain helpers (public API)                    */
/* -------------------------------------------------------------------------- */

const VERIFICATION_STATUS_TYPE_MAP = {
  approved: "ACCOUNT_VERIFICATION_APPROVED",
  completed: "ACCOUNT_VERIFICATION_COMPLETED",
  revoked: "ACCOUNT_VERIFICATION_REVOKED",
  rejected: "ACCOUNT_VERIFICATION_REJECTED",
  failed: "ACCOUNT_VERIFICATION_REJECTED",
};

export const notifyVerificationStatusChange = async ({
  userId,
  status,
  previousStatus,
  source = "system",
  metadata = {},
}) => {
  if (!isValidObjectId(userId) || !status) return null;
  const normalizedStatus = String(status).toLowerCase();
  const type = VERIFICATION_STATUS_TYPE_MAP[normalizedStatus];
  if (!type) return null;

  const previous = previousStatus
    ? String(previousStatus).toLowerCase()
    : null;
  if (previous === normalizedStatus) return null;

  try {
    return await createNotification({
      userId,
      type,
      entityType: "account",
      metadata: {
        status: normalizedStatus,
        previousStatus: previous,
        source,
        ...metadata,
      },
    });
  } catch (error) {
    console.error(
      "[notifications] verification status notify failed:",
      error?.message || error,
    );
    return null;
  }
};

export const notifyGameSubmissionStatusChange = async ({
  userId,
  status,
  questionId,
}) => {
  const doc = buildGameSubmissionNotification({ userId, status, questionId });
  if (!doc) return null;
  try {
    return await createNotification({
      userId: doc.userId,
      type: doc.type,
      entityType: doc.entityType,
      entityId: doc.entityId,
      metadata: doc.metadata,
    });
  } catch (error) {
    console.error(
      "[notifications] game submission notify failed:",
      error?.message || error,
    );
    return null;
  }
};

export const notifyCommunityJoined = async ({
  userId,
  communityId,
  communityName,
}) => {
  const doc = buildCommunityJoinedNotification({
    userId,
    communityId,
    communityName,
  });
  if (!doc) return null;
  try {
    return await createNotification({
      userId: doc.userId,
      type: doc.type,
      entityType: doc.entityType,
      entityId: doc.entityId,
      metadata: doc.metadata,
    });
  } catch (error) {
    console.error(
      "[notifications] community joined notify failed:",
      error?.message || error,
    );
    return null;
  }
};

export const notifyCommunityInvite = async ({
  userId,
  actorId,
  communityId,
  communityName,
}) => {
  const doc = buildCommunityInviteNotification({
    userId,
    actorId,
    communityId,
    communityName,
  });
  if (!doc) return null;
  try {
    return await createNotification({
      userId: doc.userId,
      actorId: doc.actorId,
      type: doc.type,
      entityType: doc.entityType,
      entityId: doc.entityId,
      metadata: doc.metadata,
    });
  } catch (error) {
    console.error(
      "[notifications] community invite notify failed:",
      error?.message || error,
    );
    return null;
  }
};

export const notifyCommunityRoleUpdated = async ({
  userId,
  communityId,
  communityName,
  role,
}) => {
  const doc = buildCommunityRoleUpdatedNotification({
    userId,
    communityId,
    communityName,
    role,
  });
  if (!doc) return null;
  try {
    return await createNotification({
      userId: doc.userId,
      type: doc.type,
      entityType: doc.entityType,
      entityId: doc.entityId,
      metadata: doc.metadata,
    });
  } catch (error) {
    console.error(
      "[notifications] community role updated notify failed:",
      error?.message || error,
    );
    return null;
  }
};

export const buildSystemMessageDoc = buildSystemMessageNotification;
export const buildMatchDoc = buildMatchNotification;
export const buildCommunityMatchDoc = buildCommunityMatchNotification;
export const buildFeedbackDoc = buildFeedbackNotification;

export const __testHelpers = {
  buildNotificationDoc,
  normalizeNotificationPayload,
  clampPagination,
};

export { NOTIFICATION_SOCKET_EVENTS };

export default {
  createNotification,
  createManyNotifications,
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  notifyVerificationStatusChange,
  notifyGameSubmissionStatusChange,
  notifyCommunityJoined,
  notifyCommunityInvite,
  notifyCommunityRoleUpdated,
  NOTIFICATION_SOCKET_EVENTS,
};
