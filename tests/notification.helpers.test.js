import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNotificationDoc,
  clampPagination,
  normalizeNotificationPayload,
} from "../services/notification.helpers.js";

test("buildNotificationDoc requires userId", () => {
  assert.throws(() =>
    buildNotificationDoc({ type: "MATCH_CREATED" }),
  );
});

test("buildNotificationDoc rejects unsupported type", () => {
  assert.throws(() =>
    buildNotificationDoc({ userId: "u1", type: "BOGUS" }),
  );
});

test("buildNotificationDoc strips dangerous metadata keys", () => {
  const doc = buildNotificationDoc({
    userId: "64a000000000000000000001",
    type: "MATCH_CREATED",
    entityType: "match",
    entityId: "64a0000000000000000000a1",
    metadata: {
      $set: { foo: "bar" },
      $unset: { foo: 1 },
      safe: "value",
    },
  });
  assert.equal(doc.metadata.safe, "value");
  assert.equal(doc.metadata.$set, undefined);
  assert.equal(doc.metadata.$unset, undefined);
});

test("buildNotificationDoc sanitizes non-object metadata", () => {
  const doc = buildNotificationDoc({
    userId: "64a000000000000000000001",
    type: "MATCH_CREATED",
    metadata: "not-an-object",
  });
  assert.deepEqual(doc.metadata, {});
});

test("buildNotificationDoc accepts ObjectId-like strings", () => {
  const doc = buildNotificationDoc({
    userId: "64a000000000000000000001",
    actorId: "64a000000000000000000002",
    type: "FEEDBACK_RECEIVED",
    entityType: "feedback",
    entityId: "r1",
  });
  assert.equal(doc.userId.toString(), "64a000000000000000000001");
  assert.equal(doc.actorId.toString(), "64a000000000000000000002");
});

test("clampPagination enforces min/max bounds", () => {
  assert.deepEqual(clampPagination({}), {
    page: 1,
    limit: 20,
  });
  assert.deepEqual(clampPagination({ page: -5, limit: -1 }), {
    page: 1,
    limit: 1,
  });
  assert.deepEqual(clampPagination({ page: 2, limit: 99999 }), {
    page: 2,
    limit: 100,
  });
});

test("normalizeNotificationPayload normalizes fields", () => {
  const raw = {
    _id: { toString: () => "n1" },
    userId: { toString: () => "u1" },
    actorId: { toString: () => "a1" },
    type: "MATCH_CREATED",
    title: "Hi",
    message: "msg",
    entityType: "match",
    entityId: "r1",
    metadata: { foo: "bar" },
    isRead: false,
    readAt: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-02"),
    toObject() {
      return raw;
    },
  };
  const out = normalizeNotificationPayload(raw);
  assert.equal(out.id, "n1");
  assert.equal(out.userId, "u1");
  assert.equal(out.actorId, "a1");
  assert.equal(out.entityId, "r1");
  assert.equal(out.metadata.foo, "bar");
  assert.equal(out.isRead, false);
});

test("normalizeNotificationPayload returns null for falsy input", () => {
  assert.equal(normalizeNotificationPayload(null), null);
  assert.equal(normalizeNotificationPayload(undefined), null);
});

test("normalizeNotificationPayload coerces non-object metadata", () => {
  const out = normalizeNotificationPayload({
    _id: "n1",
    userId: "u1",
    type: "SYSTEM_MESSAGE",
    title: "t",
    message: "m",
    entityType: "system",
    entityId: null,
    metadata: "broken",
    isRead: true,
    readAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    toObject() {
      return this;
    },
  });
  assert.deepEqual(out.metadata, {});
});
