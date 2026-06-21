import {
  buildNotificationDoc,
  isValidObjectId,
} from "./notification.helpers.js";

const GAME_STATUS_TYPE_MAP = {
  approved: "GAME_SUBMISSION_APPROVED",
  rejected: "GAME_SUBMISSION_REJECTED",
};

const COMMUNITY_TYPES = {
  JOINED: "COMMUNITY_JOINED",
  INVITE_RECEIVED: "COMMUNITY_INVITE_RECEIVED",
  ROLE_UPDATED: "COMMUNITY_ROLE_UPDATED",
};

const safeInput = (input) =>
  input && typeof input === "object" ? input : null;

const buildSystemMessageInput = ({
  userId,
  actorId = null,
  title,
  message,
  entityType = "system",
  entityId = null,
  metadata = {},
}) =>
  buildNotificationDoc({
    userId,
    actorId,
    type: "SYSTEM_MESSAGE",
    title,
    message,
    entityType,
    entityId,
    metadata,
  });

export const buildMatchNotification = ({ userId, matchedUserId, roomId }) => {
  if (!isValidObjectId(userId)) return null;
  return buildNotificationDoc({
    userId,
    actorId: matchedUserId || null,
    type: "MATCH_CREATED",
    entityType: "match",
    entityId: roomId ? String(roomId) : null,
    metadata: {
      roomId: roomId ? String(roomId) : null,
      matchedUserId: matchedUserId ? String(matchedUserId) : null,
    },
  });
};

export const buildCommunityMatchNotification = ({
  userId,
  matchedUserId,
  roomId,
  locationRoomId,
  communityName,
}) => {
  if (!isValidObjectId(userId)) return null;
  return buildNotificationDoc({
    userId,
    actorId: matchedUserId || null,
    type: "MATCH_CREATED_FROM_COMMUNITY",
    entityType: "match",
    entityId: roomId ? String(roomId) : null,
    metadata: {
      roomId: roomId ? String(roomId) : null,
      locationRoomId: locationRoomId ? String(locationRoomId) : null,
      communityName: communityName || "",
      matchedUserId: matchedUserId ? String(matchedUserId) : null,
    },
  });
};

export const buildFeedbackNotification = ({
  userId,
  actorId,
  roomId,
  rating,
  reason,
}) => {
  if (!isValidObjectId(userId)) return null;
  return buildNotificationDoc({
    userId,
    actorId: actorId || null,
    type: "FEEDBACK_RECEIVED",
    entityType: "feedback",
    entityId: roomId ? String(roomId) : null,
    metadata: {
      roomId: roomId ? String(roomId) : null,
      rating: rating ?? null,
      reason: reason || "",
    },
  });
};

export const buildGameSubmissionNotification = ({ userId, status, questionId }) => {
  if (!isValidObjectId(userId)) return null;
  const normalized = String(status || "").toLowerCase();
  const type = GAME_STATUS_TYPE_MAP[normalized];
  if (!type) return null;
  return buildNotificationDoc({
    userId,
    type,
    entityType: "game",
    entityId: questionId ? String(questionId) : null,
    metadata: { status: normalized },
  });
};

export const buildCommunityJoinedNotification = ({
  userId,
  communityId,
  communityName,
}) => {
  if (!isValidObjectId(userId)) return null;
  return buildNotificationDoc({
    userId,
    type: COMMUNITY_TYPES.JOINED,
    entityType: "community",
    entityId: communityId ? String(communityId) : null,
    metadata: { communityName: communityName || "" },
  });
};

export const buildCommunityInviteNotification = ({
  userId,
  actorId,
  communityId,
  communityName,
}) => {
  if (!isValidObjectId(userId)) return null;
  return buildNotificationDoc({
    userId,
    actorId: actorId || null,
    type: COMMUNITY_TYPES.INVITE_RECEIVED,
    entityType: "community",
    entityId: communityId ? String(communityId) : null,
    metadata: { communityName: communityName || "" },
  });
};

export const buildCommunityRoleUpdatedNotification = ({
  userId,
  communityId,
  communityName,
  role,
}) => {
  if (!isValidObjectId(userId)) return null;
  return buildNotificationDoc({
    userId,
    type: COMMUNITY_TYPES.ROLE_UPDATED,
    entityType: "community",
    entityId: communityId ? String(communityId) : null,
    metadata: { communityName: communityName || "", role: role || "" },
  });
};

export const buildSystemMessageNotification = (input) => {
  const safe = safeInput(input);
  if (!safe) return null;
  return buildSystemMessageInput({
    userId: safe.userId,
    actorId: safe.actorId,
    title: safe.title,
    message: safe.message,
    entityType: safe.entityType,
    entityId: safe.entityId,
    metadata: safe.metadata,
  });
};
