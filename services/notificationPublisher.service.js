import { isValidObjectId } from "../utils/objectId.js";
import {
  buildCommunityJoinedNotification,
  buildGameSubmissionNotification,
} from "./notification.templates.js";
import { createNotification } from "./notification.service.js";
import { logError } from "../utils/logError.js";

const VERIFICATION_STATUS_TYPE_MAP = {
  approved: "ACCOUNT_VERIFICATION_APPROVED",
  completed: "ACCOUNT_VERIFICATION_COMPLETED",
  revoked: "ACCOUNT_VERIFICATION_REVOKED",
  rejected: "ACCOUNT_VERIFICATION_REJECTED",
  failed: "ACCOUNT_VERIFICATION_REJECTED",
};

const createNotificationSafely = async (input, context) => {
  try {
    return await createNotification(input);
  } catch (error) {
    logError(`[notifications] ${context} notify failed`, error);
    return null;
  }
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

  return createNotificationSafely(
    {
      userId,
      type,
      entityType: "account",
      metadata: {
        status: normalizedStatus,
        previousStatus: previous,
        source,
        ...metadata,
      },
    },
    "verification status",
  );
};

export const notifyGameSubmissionStatusChange = async ({
  userId,
  status,
  questionId,
}) => {
  const doc = buildGameSubmissionNotification({ userId, status, questionId });
  return doc ? createNotificationSafely(doc, "game submission") : null;
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
  return doc ? createNotificationSafely(doc, "community joined") : null;
};
