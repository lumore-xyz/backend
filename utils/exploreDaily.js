export const EXPLORE_DAILY_STATUS = Object.freeze({
  GENERATING: "generating",
  PREPARED: "prepared",
  READY: "ready",
  EMPTY: "empty",
  FAILED: "failed",
});

export const EXPLORE_DAILY_STATUSES = Object.freeze(
  Object.values(EXPLORE_DAILY_STATUS),
);

export const EXPLORE_NOTE_STATUS = Object.freeze({
  GENERATED: "generated",
  FALLBACK: "fallback",
});

export const EXPLORE_NOTE_STATUSES = Object.freeze(
  Object.values(EXPLORE_NOTE_STATUS),
);
