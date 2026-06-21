import assert from "node:assert/strict";
import test from "node:test";

import {
  NOTIFICATION_TYPES,
  NOTIFICATION_ENTITY_TYPES,
  buildNotificationCopy,
  resolveEntityTypeForType,
  NOTIFICATION_PAGINATION,
} from "../libs/notificationConstants.js";

test("NOTIFICATION_TYPES exports expected values", () => {
  assert.ok(NOTIFICATION_TYPES.includes("MATCH_CREATED"));
  assert.ok(NOTIFICATION_TYPES.includes("MATCH_CREATED_FROM_COMMUNITY"));
  assert.ok(NOTIFICATION_TYPES.includes("FEEDBACK_RECEIVED"));
  assert.ok(NOTIFICATION_TYPES.includes("ACCOUNT_VERIFICATION_APPROVED"));
  assert.ok(NOTIFICATION_TYPES.includes("ACCOUNT_VERIFICATION_REVOKED"));
  assert.ok(NOTIFICATION_TYPES.includes("ACCOUNT_VERIFICATION_REJECTED"));
  assert.ok(NOTIFICATION_TYPES.includes("GAME_SUBMISSION_APPROVED"));
  assert.ok(NOTIFICATION_TYPES.includes("GAME_SUBMISSION_REJECTED"));
  assert.ok(NOTIFICATION_TYPES.includes("COMMUNITY_JOINED"));
  assert.ok(NOTIFICATION_TYPES.includes("COMMUNITY_INVITE_RECEIVED"));
  assert.ok(NOTIFICATION_TYPES.includes("COMMUNITY_ROLE_UPDATED"));
  assert.ok(NOTIFICATION_TYPES.includes("SYSTEM_MESSAGE"));
});

test("NOTIFICATION_ENTITY_TYPES exports expected values", () => {
  assert.deepEqual(
    [...NOTIFICATION_ENTITY_TYPES].sort(),
    [
      "account",
      "community",
      "feedback",
      "game",
      "match",
      "system",
    ],
  );
});

test("buildNotificationCopy uses default template for MATCH_CREATED", () => {
  const copy = buildNotificationCopy({
    type: "MATCH_CREATED",
    variables: { matchedUserName: "Alice" },
  });
  assert.equal(copy.title, "New match!");
  assert.equal(copy.message, "You got matched with Alice");
  assert.equal(copy.entityType, "match");
});

test("buildNotificationCopy substitutes community name for community match", () => {
  const copy = buildNotificationCopy({
    type: "MATCH_CREATED_FROM_COMMUNITY",
    variables: { matchedUserName: "Bob", communityName: "Indiranagar" },
  });
  assert.equal(copy.entityType, "match");
  assert.ok(copy.message.includes("Bob"));
  assert.ok(copy.message.includes("Indiranagar"));
});

test("buildNotificationCopy uses fallback for missing variables", () => {
  const copy = buildNotificationCopy({
    type: "MATCH_CREATED",
    variables: {},
  });
  assert.equal(copy.message, "You got matched with someone");
});

test("buildNotificationCopy returns provided title/message if any", () => {
  const copy = buildNotificationCopy({
    type: "SYSTEM_MESSAGE",
    variables: {
      title: "Heads up",
      message: "Server maintenance tonight",
    },
  });
  assert.equal(copy.title, "Heads up");
  assert.equal(copy.message, "Server maintenance tonight");
  assert.equal(copy.entityType, "system");
});

test("buildNotificationCopy falls back gracefully for unknown types", () => {
  const copy = buildNotificationCopy({
    type: "SOMETHING_UNKNOWN",
    variables: { title: "Hi", message: "There" },
  });
  assert.equal(copy.title, "Hi");
  assert.equal(copy.message, "There");
});

test("resolveEntityTypeForType returns expected entity", () => {
  assert.equal(resolveEntityTypeForType("MATCH_CREATED"), "match");
  assert.equal(resolveEntityTypeForType("FEEDBACK_RECEIVED"), "feedback");
  assert.equal(resolveEntityTypeForType("ACCOUNT_VERIFICATION_APPROVED"), "account");
  assert.equal(resolveEntityTypeForType("GAME_SUBMISSION_APPROVED"), "game");
  assert.equal(resolveEntityTypeForType("COMMUNITY_INVITE_RECEIVED"), "community");
  assert.equal(resolveEntityTypeForType("SYSTEM_MESSAGE"), "system");
});

test("NOTIFICATION_PAGINATION has sane defaults", () => {
  assert.equal(NOTIFICATION_PAGINATION.DEFAULT_PAGE, 1);
  assert.ok(NOTIFICATION_PAGINATION.DEFAULT_LIMIT >= 1);
  assert.ok(NOTIFICATION_PAGINATION.MAX_LIMIT >= NOTIFICATION_PAGINATION.DEFAULT_LIMIT);
});
