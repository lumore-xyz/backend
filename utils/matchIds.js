export const getId = (value) =>
  value?._id?.toString?.() ||
  value?.id?.toString?.() ||
  value?.toString?.() ||
  "";

export const getSortedIds = (firstId, secondId) =>
  [getId(firstId), getId(secondId)].sort();

export const getPairKey = (userId1, userId2) =>
  getSortedIds(userId1, userId2).join(":");
