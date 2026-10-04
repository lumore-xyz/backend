import { isValidObjectId, toObjectId } from "../utils/objectId.js";
import { isPlainObject } from "../utils/object.js";
import { getPagination } from "../utils/pagination.js";

import {
  NOTIFICATION_PAGINATION,
  NOTIFICATION_TYPE_SET,
  buildNotificationCopy,
} from "../libs/notificationConstants.js";

const BANNED_METADATA_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",
  "$set",
  "$unset",
  "$inc",
]);

export const clampPagination = ({ page, limit }) =>
  getPagination(
    { page, limit },
    {
      defaultPage: NOTIFICATION_PAGINATION.DEFAULT_PAGE,
      defaultLimit: NOTIFICATION_PAGINATION.DEFAULT_LIMIT,
      maxLimit: NOTIFICATION_PAGINATION.MAX_LIMIT,
    },
  );

const sanitizeMetadata = (metadata) => {
  if (!isPlainObject(metadata)) return {};
  // Strip reserved/internal keys so callers can't smuggle Mongo operators or
  // arbitrarily-large payloads via metadata.
  const cleaned = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!key || BANNED_METADATA_KEYS.has(key)) continue;
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
    userId: toObjectId(userId),
    actorId:
      actorId && isValidObjectId(actorId) ? toObjectId(actorId) : null,
    type,
    title: copy.title,
    message: copy.message,
    entityType: copy.entityType || entityType || null,
    ...(entityId ? { entityId: String(entityId) } : {}),
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
