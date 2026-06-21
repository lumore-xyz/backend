import { Types } from "mongoose";

import {
  NOTIFICATION_PAGINATION,
  NOTIFICATION_TYPE_SET,
  buildNotificationCopy,
} from "../libs/notificationConstants.js";

export const isValidObjectId = (value) => {
  if (!value) return false;
  if (value instanceof Types.ObjectId) return true;
  return Types.ObjectId.isValid(String(value));
};

export const buildObjectId = (value) => {
  if (!value) return null;
  if (value instanceof Types.ObjectId) return value;
  return new Types.ObjectId(String(value));
};

export const toObjectIdString = (value) => {
  if (!value) return null;
  if (value instanceof Types.ObjectId) return value.toString();
  if (typeof value === "string") return value;
  if (value?._id) {
    return value._id?.toString?.() || String(value._id);
  }
  return String(value);
};

export const clampPagination = ({ page, limit }) => {
  const safePage = Math.max(
    Number(page) || NOTIFICATION_PAGINATION.DEFAULT_PAGE,
    1,
  );
  const requestedLimit = Number(limit) || NOTIFICATION_PAGINATION.DEFAULT_LIMIT;
  const safeLimit = Math.min(
    Math.max(requestedLimit, 1),
    NOTIFICATION_PAGINATION.MAX_LIMIT,
  );
  return { page: safePage, limit: safeLimit };
};

const sanitizeMetadata = (metadata) => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }
  // Strip reserved/internal keys so callers can't smuggle Mongo operators or
  // arbitrarily-large payloads via metadata.
  const bannedKeys = new Set([
    "__proto__",
    "prototype",
    "constructor",
    "$set",
    "$unset",
    "$inc",
  ]);
  const cleaned = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!key || bannedKeys.has(key)) continue;
    if (value === undefined) continue;
    cleaned[key] = value;
  }
  return cleaned;
};

const ensureSupportedType = (type) => {
  if (!type || !NOTIFICATION_TYPE_SET.has(type)) {
    throw new Error(`Unsupported notification type: ${type}`);
  }
};

export const buildNotificationDoc = ({
  userId,
  actorId = null,
  type,
  title,
  message,
  entityType = null,
  entityId = null,
  metadata = {},
}) => {
  if (!isValidObjectId(userId)) {
    throw new Error("userId is required to create a notification");
  }
  ensureSupportedType(type);

  const copy = buildNotificationCopy({
    type,
    variables: { title, message, entityType },
  });

  return {
    userId: buildObjectId(userId),
    actorId:
      actorId && isValidObjectId(actorId) ? buildObjectId(actorId) : null,
    type,
    title: copy.title,
    message: copy.message,
    entityType: copy.entityType || entityType || null,
    entityId: entityId ? String(entityId) : null,
    metadata: sanitizeMetadata(metadata),
    isRead: false,
    readAt: null,
  };
};

export const normalizeNotificationPayload = (doc) => {
  if (!doc) return null;
  const obj = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  return {
    id: obj._id?.toString?.() || obj.id,
    userId: obj.userId?.toString?.() || obj.userId,
    actorId: obj.actorId ? obj.actorId.toString() : null,
    type: obj.type,
    title: obj.title,
    message: obj.message,
    entityType: obj.entityType || null,
    entityId: obj.entityId ? String(obj.entityId) : null,
    metadata:
      obj.metadata && typeof obj.metadata === "object" ? obj.metadata : {},
    isRead: Boolean(obj.isRead),
    readAt: obj.readAt || null,
    createdAt: obj.createdAt || null,
    updatedAt: obj.updatedAt || null,
  };
};
