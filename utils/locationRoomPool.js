export const LOCATION_ROOM_POOL_STATUS = Object.freeze({
  IN_POOL: "in_pool",
  MATCHED: "matched",
  LEFT: "left",
  INSUFFICIENT_CREDITS: "insufficient_credits",
  INELIGIBLE: "ineligible",
});

export const LOCATION_ROOM_POOL_STATUSES = Object.freeze(
  Object.values(LOCATION_ROOM_POOL_STATUS),
);
