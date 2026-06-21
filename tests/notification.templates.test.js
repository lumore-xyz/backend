import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCommunityInviteNotification,
  buildCommunityJoinedNotification,
  buildCommunityMatchNotification,
  buildCommunityRoleUpdatedNotification,
  buildFeedbackNotification,
  buildGameSubmissionNotification,
  buildMatchNotification,
  buildSystemMessageNotification,
} from "../services/notification.templates.js";

const USER_ID = "64a000000000000000000001";

test("buildMatchNotification produces MATCH_CREATED with entity", () => {
  const doc = buildMatchNotification({
    userId: USER_ID,
    matchedUserId: "64a000000000000000000002",
    roomId: "room-1",
  });
  assert.equal(doc.type, "MATCH_CREATED");
  assert.equal(doc.entityType, "match");
  assert.equal(doc.entityId, "room-1");
  assert.equal(doc.metadata.matchedUserId, "64a000000000000000000002");
});

test("buildMatchNotification returns null without userId", () => {
  assert.equal(
    buildMatchNotification({ matchedUserId: "x", roomId: "r" }),
    null,
  );
});

test("buildCommunityMatchNotification includes community metadata", () => {
  const doc = buildCommunityMatchNotification({
    userId: USER_ID,
    matchedUserId: "64a000000000000000000002",
    roomId: "room-1",
    locationRoomId: "loc-1",
    communityName: "Indiranagar",
  });
  assert.equal(doc.type, "MATCH_CREATED_FROM_COMMUNITY");
  assert.equal(doc.metadata.communityName, "Indiranagar");
  assert.equal(doc.metadata.locationRoomId, "loc-1");
});

test("buildFeedbackNotification maps known fields", () => {
  const doc = buildFeedbackNotification({
    userId: USER_ID,
    actorId: "64a000000000000000000002",
    roomId: "room-1",
    rating: 8,
    reason: "great chat",
  });
  assert.equal(doc.type, "FEEDBACK_RECEIVED");
  assert.equal(doc.metadata.rating, 8);
  assert.equal(doc.metadata.reason, "great chat");
});

test("buildGameSubmissionNotification maps approved/rejected", () => {
  const approved = buildGameSubmissionNotification({
    userId: USER_ID,
    status: "approved",
    questionId: "q1",
  });
  const rejected = buildGameSubmissionNotification({
    userId: USER_ID,
    status: "rejected",
    questionId: "q1",
  });
  const unknown = buildGameSubmissionNotification({
    userId: USER_ID,
    status: "whatever",
    questionId: "q1",
  });
  assert.equal(approved?.type, "GAME_SUBMISSION_APPROVED");
  assert.equal(rejected?.type, "GAME_SUBMISSION_REJECTED");
  assert.equal(unknown, null);
});

test("buildCommunityJoinedNotification uses COMMUNITY_JOINED", () => {
  const doc = buildCommunityJoinedNotification({
    userId: USER_ID,
    communityId: "c1",
    communityName: "Indiranagar",
  });
  assert.equal(doc?.type, "COMMUNITY_JOINED");
  assert.equal(doc?.entityType, "community");
  assert.equal(doc?.metadata.communityName, "Indiranagar");
});

test("buildCommunityInviteNotification carries actor", () => {
  const doc = buildCommunityInviteNotification({
    userId: USER_ID,
    actorId: "64a000000000000000000002",
    communityId: "c1",
    communityName: "X",
  });
  assert.equal(doc?.type, "COMMUNITY_INVITE_RECEIVED");
  assert.equal(doc?.actorId.toString(), "64a000000000000000000002");
});

test("buildCommunityRoleUpdatedNotification captures role", () => {
  const doc = buildCommunityRoleUpdatedNotification({
    userId: USER_ID,
    communityId: "c1",
    communityName: "X",
    role: "admin",
  });
  assert.equal(doc?.type, "COMMUNITY_ROLE_UPDATED");
  assert.equal(doc?.metadata.role, "admin");
});

test("buildSystemMessageNotification returns null on bad input", () => {
  assert.equal(buildSystemMessageNotification(null), null);
  assert.equal(buildSystemMessageNotification("string"), null);
});
