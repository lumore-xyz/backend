import assert from "node:assert/strict";
import test from "node:test";
import { selectRoomMatchPairs } from "../services/locationRoomMatching.service.js";

test("selectRoomMatchPairs gives an odd leftover a compatible extra-match partner", () => {
  const result = selectRoomMatchPairs({
    edges: [
      { userId1: "user-a", userId2: "user-b", score: 95 },
      { userId1: "user-a", userId2: "user-c", score: 82 },
      { userId1: "user-b", userId2: "user-c", score: 70 },
    ],
  });

  assert.equal(result.selected.length, 2);
  assert.deepEqual(
    result.selected.map((edge) => [edge.userId1, edge.userId2]),
    [
      ["user-a", "user-b"],
      ["user-a", "user-c"],
    ],
  );
  assert.equal(result.matchCounts.get("user-a"), 2);
  assert.equal(result.matchCounts.get("user-b"), 1);
  assert.equal(result.matchCounts.get("user-c"), 1);
  assert.deepEqual(result.unmatchedUserIds, []);
});

test("selectRoomMatchPairs never creates duplicate pair keys", () => {
  const result = selectRoomMatchPairs({
    edges: [
      { userId1: "user-a", userId2: "user-b", score: 95 },
      { userId1: "user-b", userId2: "user-a", score: 94 },
      { userId1: "user-c", userId2: "user-d", score: 90 },
    ],
  });

  const pairKeys = result.selected.map((edge) =>
    [edge.userId1, edge.userId2].sort().join(":"),
  );
  assert.equal(new Set(pairKeys).size, pairKeys.length);
});

test("selectRoomMatchPairs skips active or archived already-matched pairs", () => {
  const result = selectRoomMatchPairs({
    edges: [
      { userId1: "user-a", userId2: "user-b", score: 95 },
      { userId1: "user-a", userId2: "user-c", score: 90 },
      { userId1: "user-b", userId2: "user-c", score: 80 },
    ],
    blockedPairKeys: new Set(["user-a:user-b"]),
  });

  const selectedPairKeys = result.selected.map((edge) =>
    [edge.userId1, edge.userId2].sort().join(":"),
  );

  assert.ok(!selectedPairKeys.includes("user-a:user-b"));
  assert.ok(selectedPairKeys.includes("user-a:user-c"));
  assert.ok(selectedPairKeys.includes("user-b:user-c"));
  assert.equal(result.matchCounts.get("user-a"), 1);
  assert.equal(result.matchCounts.get("user-b"), 1);
  assert.equal(result.matchCounts.get("user-c"), 2);
});

test("selectRoomMatchPairs keeps a solo eligible user unmatched", () => {
  const result = selectRoomMatchPairs({
    edges: [],
    eligibleUserIds: ["solo-user"],
  });

  assert.equal(result.selected.length, 0);
  assert.equal(result.matchCounts.get("solo-user"), 0);
  assert.deepEqual(result.unmatchedUserIds, ["solo-user"]);
});
