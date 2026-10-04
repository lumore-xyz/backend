import { getId, getPairKey } from "../utils/matchIds.js";

export const selectRoomMatchPairs = ({
  edges,
  eligibleUserIds = [],
  maxMatchesPerUser = 2,
  blockedPairKeys = new Set(),
}) => {
  const sortedEdges = [...(edges || [])].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return getPairKey(a.userId1, a.userId2).localeCompare(
      getPairKey(b.userId1, b.userId2),
    );
  });
  const userIds = new Set(
    (eligibleUserIds || []).map((userId) => getId(userId)).filter(Boolean),
  );
  for (const edge of sortedEdges) {
    userIds.add(getId(edge.userId1));
    userIds.add(getId(edge.userId2));
  }

  const edgesByUser = new Map(Array.from(userIds, (userId) => [userId, []]));
  for (const edge of sortedEdges) {
    edgesByUser.get(getId(edge.userId1)).push(edge);
    edgesByUser.get(getId(edge.userId2)).push(edge);
  }

  const matchCounts = new Map(Array.from(userIds).map((userId) => [userId, 0]));
  const usedPairs = new Set(Array.from(blockedPairKeys || []).map(String));
  const selected = [];

  const selectEdge = (edge) => {
    const userId1 = getId(edge.userId1);
    const userId2 = getId(edge.userId2);
    const pairKey = getPairKey(userId1, userId2);
    if (usedPairs.has(pairKey)) return false;
    selected.push(edge);
    usedPairs.add(pairKey);
    matchCounts.set(userId1, (matchCounts.get(userId1) || 0) + 1);
    matchCounts.set(userId2, (matchCounts.get(userId2) || 0) + 1);
    return true;
  };

  for (const edge of sortedEdges) {
    const userId1 = getId(edge.userId1);
    const userId2 = getId(edge.userId2);
    if (
      (matchCounts.get(userId1) || 0) === 0 &&
      (matchCounts.get(userId2) || 0) === 0
    ) {
      selectEdge(edge);
    }
  }

  for (const userId of userIds) {
    if ((matchCounts.get(userId) || 0) > 0) continue;
    const edge = edgesByUser.get(userId).find((candidate) => {
      const userId1 = getId(candidate.userId1);
      const userId2 = getId(candidate.userId2);
      if (usedPairs.has(getPairKey(userId1, userId2))) return false;
      if (userId1 !== userId && userId2 !== userId) return false;
      const otherUserId = userId1 === userId ? userId2 : userId1;
      return (
        (matchCounts.get(otherUserId) || 0) > 0 &&
        (matchCounts.get(otherUserId) || 0) < maxMatchesPerUser
      );
    });
    if (edge) selectEdge(edge);
  }

  return {
    selected,
    matchCounts,
    unmatchedUserIds: Array.from(userIds).filter(
      (userId) => (matchCounts.get(userId) || 0) === 0,
    ),
  };
};
