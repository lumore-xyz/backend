// Centralized notification type, entity-type, and copy constants.
// New notification types can be added here and they will automatically
// be available to the Notification model, the NotificationService,
// and the mobile client (via API metadata).

export const NOTIFICATION_TYPES = Object.freeze([
  "MATCH_CREATED",
  "MATCH_CREATED_FROM_COMMUNITY",
  "FEEDBACK_RECEIVED",
  "ACCOUNT_VERIFICATION_APPROVED",
  "ACCOUNT_VERIFICATION_COMPLETED",
  "ACCOUNT_VERIFICATION_REVOKED",
  "ACCOUNT_VERIFICATION_REJECTED",
  "GAME_SUBMISSION_APPROVED",
  "GAME_SUBMISSION_REJECTED",
  "COMMUNITY_JOINED",
  "COMMUNITY_INVITE_RECEIVED",
  "COMMUNITY_ROLE_UPDATED",
  "SYSTEM_MESSAGE",
]);

export const NOTIFICATION_TYPE_SET = new Set(NOTIFICATION_TYPES);

export const NOTIFICATION_ENTITY_TYPES = Object.freeze([
  "match",
  "community",
  "feedback",
  "game",
  "account",
  "system",
]);

export const NOTIFICATION_ENTITY_TYPE_SET = new Set(NOTIFICATION_ENTITY_TYPES);

const defaultTemplates = {
  MATCH_CREATED: {
    title: "New match!",
    message: "You got matched with {matchedUserName}",
    entityType: "match",
  },
  MATCH_CREATED_FROM_COMMUNITY: {
    title: "New community match!",
    message: "You got matched with {matchedUserName} from {communityName}",
    entityType: "match",
  },
  FEEDBACK_RECEIVED: {
    title: "New feedback",
    message: "You received new feedback from {actorName}",
    entityType: "feedback",
  },
  ACCOUNT_VERIFICATION_APPROVED: {
    title: "Verification approved",
    message: "Your account verification is complete",
    entityType: "account",
  },
  ACCOUNT_VERIFICATION_COMPLETED: {
    title: "Verification complete",
    message: "Your account verification is complete",
    entityType: "account",
  },
  ACCOUNT_VERIFICATION_REVOKED: {
    title: "Verification revoked",
    message: "Your account verification was revoked",
    entityType: "account",
  },
  ACCOUNT_VERIFICATION_REJECTED: {
    title: "Verification rejected",
    message: "Your account verification was rejected",
    entityType: "account",
  },
  GAME_SUBMISSION_APPROVED: {
    title: "Submission approved",
    message: "Your game submission was approved",
    entityType: "game",
  },
  GAME_SUBMISSION_REJECTED: {
    title: "Submission rejected",
    message: "Your game submission was rejected",
    entityType: "game",
  },
  COMMUNITY_JOINED: {
    title: "Joined community",
    message: "You joined {communityName}",
    entityType: "community",
  },
  COMMUNITY_INVITE_RECEIVED: {
    title: "Community invite",
    message: "{actorName} invited you to {communityName}",
    entityType: "community",
  },
  COMMUNITY_ROLE_UPDATED: {
    title: "Role updated",
    message: "Your role in {communityName} was updated to {role}",
    entityType: "community",
  },
  SYSTEM_MESSAGE: {
    title: "System message",
    message: "",
    entityType: "system",
  },
};

const PLACEHOLDER_PATTERN = /\{([a-zA-Z0-9_]+)\}/g;

const formatTemplate = (template, variables = {}) =>
  String(template || "").replace(
    PLACEHOLDER_PATTERN,
    (match, key) => {
      if (!Object.prototype.hasOwnProperty.call(variables, key)) return match;
      const value = variables[key];
      if (value === null || value === undefined) return match;
      return String(value);
    },
  );

export const getNotificationTypeTemplate = (type) =>
  defaultTemplates[type] || null;

export const buildNotificationCopy = ({ type, variables = {} }) => {
  const template = defaultTemplates[type];
  if (!template) {
    return {
      title: variables.title || "Notification",
      message: variables.message || "",
      entityType: variables.entityType || "system",
    };
  }

  const variablesWithFallback = {
    matchedUserName: "someone",
    communityName: "a community",
    actorName: "someone",
    role: "member",
    ...variables,
  };

  const providedTitle = variables.title;
  const providedMessage = variables.message;

  return {
    title: providedTitle
      ? String(providedTitle)
      : formatTemplate(template.title, variablesWithFallback),
    message: providedMessage
      ? String(providedMessage)
      : formatTemplate(template.message, variablesWithFallback),
    entityType: variables.entityType || template.entityType || null,
  };
};

export const resolveEntityTypeForType = (type) => {
  const template = defaultTemplates[type];
  return template?.entityType || "system";
};

export const NOTIFICATION_DEFAULT_PAGE_LIMIT = 20;
export const NOTIFICATION_MAX_PAGE_LIMIT = 100;

export const NOTIFICATION_PAGINATION = Object.freeze({
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: NOTIFICATION_DEFAULT_PAGE_LIMIT,
  MAX_LIMIT: NOTIFICATION_MAX_PAGE_LIMIT,
});
