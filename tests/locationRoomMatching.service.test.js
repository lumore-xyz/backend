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
