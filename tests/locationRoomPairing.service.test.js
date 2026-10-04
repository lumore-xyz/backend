import assert from "node:assert/strict";
import test from "node:test";
import { selectRoomMatchPairs } from "../services/locationRoomPairing.service.js";

test("selectRoomMatchPairs chooses highest scoring disjoint pairs", () => {
  const { selected, matchCounts, unmatchedUserIds } = selectRoomMatchPairs({
    eligibleUserIds: ["a", "b", "c", "d"],
    edges: [
      { userId1: "a", userId2: "b", score: 90 },
      { userId1: "a", userId2: "c", score: 80 },
      { userId1: "b", userId2: "d", score: 70 },
      { userId1: "c", userId2: "d", score: 60 },
    ],
    maxMatchesPerUser: 1,
  });

  assert.deepEqual(
    selected.map(({ userId1, userId2 }) => [userId1, userId2]),
    [["a", "b"], ["c", "d"]],
  );
  assert.deepEqual([...matchCounts.values()], [1, 1, 1, 1]);
  assert.deepEqual(unmatchedUserIds, []);
});
