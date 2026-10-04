import { isValidObjectId } from "../utils/objectId.js";
import { isPlainObject } from "../utils/object.js";

const GAME_STATUS_TYPE_MAP = {
  approved: "GAME_SUBMISSION_APPROVED",
  rejected: "GAME_SUBMISSION_REJECTED",
};

const COMMUNITY_TYPES = {
  JOINED: "COMMUNITY_JOINED",
  INVITE_RECEIVED: "COMMUNITY_INVITE_RECEIVED",
  ROLE_UPDATED: "COMMUNITY_ROLE_UPDATED",
};

const buildForValidUser = (input) =>
  isValidObjectId(input?.userId) ? input : null;

const buildSystemMessageInput = ({
  userId,
  actorId = null,
  title,
  message,
  entityType = "system",
  entityId = null,
  metadata = {},
}) =>
  buildForValidUser({
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
  return buildForValidUser({
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
  return buildForValidUser({
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
  return buildForValidUser({
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
  const normalized = String(status || "").toLowerCase();
  const type = GAME_STATUS_TYPE_MAP[normalized];
  if (!type) return null;
  return buildForValidUser({
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
  return buildForValidUser({
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
  return buildForValidUser({
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
  return buildForValidUser({
    userId,
    type: COMMUNITY_TYPES.ROLE_UPDATED,
    entityType: "community",
    entityId: communityId ? String(communityId) : null,
    metadata: { communityName: communityName || "", role: role || "" },
  });
};

export const buildSystemMessageNotification = (input) => {
  const safe = isPlainObject(input) ? input : null;
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
