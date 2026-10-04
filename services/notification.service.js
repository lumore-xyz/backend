import Notification from "../models/notification.model.js";
import { mapInBatches } from "../utils/batch.js";
import {
  buildNotificationDoc,
  clampPagination,
  normalizeNotificationPayload,
} from "./notification.helpers.js";
import { isValidObjectId, toObjectId } from "../utils/objectId.js";
import { isPlainObject } from "../utils/object.js";
import { logError } from "../utils/logError.js";
import { hasMorePages } from "../utils/pagination.js";
import {
  emitBatchCreated,
  emitNotificationCreated,
  emitNotificationDeleted,
  emitNotificationUpdated,
  emitUnreadCount,
} from "./notification.events.js";

const safeInputArray = (inputs) =>
  Array.isArray(inputs) ? inputs.filter(isPlainObject) : [];

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

  const query = {
    userId: doc.userId,
    type: doc.type,
    entityType: doc.entityType,
    entityId: doc.entityId,
  };
  let result;
  try {
    result = await Notification.findOneAndUpdate(
      query,
      { $setOnInsert: doc },
      {
        returnDocument: "after",
        upsert: true,
        includeResultMetadata: true,
        setDefaultsOnInsert: true,
      },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    const existing = await Notification.findOne(query).lean();
    if (!existing) throw error;
    return { doc: existing, created: false };
  }

  const created = !result?.lastErrorObject?.updatedExisting;
  return { doc: result?.value?.toObject?.() || result?.value, created };
};

export const createNotification = async (input) => {
  if (!isPlainObject(input)) {
    throw new Error("createNotification requires an input object");
  }

  const doc = buildNotificationDoc(input);
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
        logError("[notifications] create_many_entry_skipped", error);
        return null;
      }
    })
    .filter(Boolean);

  if (!built.length) return [];

  const withEntity = built.filter((doc) => doc.entityType && doc.entityId);
  const withoutEntity = built.filter((doc) => !doc.entityType || !doc.entityId);
  const [persisted, inserted] = await Promise.all([
    mapInBatches(withEntity, 50, persistNotification),
    withoutEntity.length
      ? Notification.insertMany(withoutEntity, { ordered: false })
      : [],
  ]);
  const createdDocs = [
    ...persisted.filter((item) => item.created).map((item) => item.doc),
    ...inserted,
  ];
  const formatted = createdDocs.map(normalizeNotificationPayload);
  if (!formatted.length) return [];

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
  const userObjectId = toObjectId(userId);
  const filter = { userId: userObjectId };
  if (unreadOnly) filter.isRead = false;

  const skip = (safePage - 1) * safeLimit;
  const totalCount = Notification.countDocuments(filter).exec();
  const unreadCountQuery = unreadOnly
    ? totalCount
    : Notification.countDocuments({ userId: userObjectId, isRead: false });
  const [docs, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    totalCount,
    unreadCountQuery,
  ]);

  return {
    data: docs.map((doc) => normalizeNotificationPayload({ ...doc, _id: doc._id })),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      hasMore: hasMorePages({
        page: safePage,
        limit: safeLimit,
        total,
        itemCount: docs.length,
      }),
    },
    unreadCount,
  };
};

export const getUnreadCount = async (userId) => {
  if (!isValidObjectId(userId)) return 0;
  return Notification.countDocuments({
    userId: toObjectId(userId),
    isRead: false,
  });
};

export const markAsRead = async (userId, notificationId) => {
  if (!isValidObjectId(userId) || !isValidObjectId(notificationId)) {
    return null;
  }

  const updated = await Notification.findOneAndUpdate(
    {
      _id: toObjectId(notificationId),
      userId: toObjectId(userId),
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
    { userId: toObjectId(userId), isRead: false },
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
    _id: toObjectId(notificationId),
    userId: toObjectId(userId),
  });
  if (!result) return { deleted: false };

  const unreadCount = await getUnreadCount(userId);
  emitNotificationDeleted(userId, result._id.toString());
  emitUnreadCount(userId, unreadCount);
  return { deleted: true };
};
