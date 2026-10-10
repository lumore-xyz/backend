export const LOCATION_ROOM_STATUS = Object.freeze({
  ACTIVE: "active",
  ARCHIVED: "archived",
});

export const LOCATION_ROOM_STATUSES = Object.freeze(
  Object.values(LOCATION_ROOM_STATUS),
);

export const LOCATION_ROOM_VISIBILITY = Object.freeze({
  PUBLIC: "public",
  PRIVATE: "private",
});

export const LOCATION_ROOM_VISIBILITY_VALUES = Object.freeze(
  Object.values(LOCATION_ROOM_VISIBILITY),
);

export const LOCATION_ROOM_TYPE = Object.freeze({ LOCAL: "local", TOPIC: "topic" });
export const LOCATION_ROOM_TYPE_VALUES = Object.freeze(Object.values(LOCATION_ROOM_TYPE));

export const LOCATION_ROOM_TAG_LIMIT = 5;
export const LOCATION_ROOM_TAG_LENGTH_LIMIT = 24;

export const normalizeLocationRoomTags = (value) => {
  if (value === undefined || value === null || value === "") return [];
  let tags = value;
  if (typeof tags === "string") {
    try {
      tags = JSON.parse(tags);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(tags) || tags.length > LOCATION_ROOM_TAG_LIMIT || tags.some((tag) => typeof tag !== "string")) {
    return null;
  }

  const normalizedTags = tags.map((tag) => tag.trim().replace(/^#/, "").replace(/\s+/g, " ").toLowerCase());
  if (normalizedTags.some((tag) => [...tag].length > LOCATION_ROOM_TAG_LENGTH_LIMIT)) return null;
  return [...new Set(normalizedTags.filter(Boolean))];
};

export const LOCATION_ROOM_CYCLE_STATUS = Object.freeze({
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
});

export const LOCATION_ROOM_CYCLE_STATUSES = Object.freeze(
  Object.values(LOCATION_ROOM_CYCLE_STATUS),
);

const getSecondsUntil = (date, now = new Date()) => {
  const timestamp = new Date(date).getTime();
  if (Number.isNaN(timestamp)) return 0;
  return Math.max(0, Math.ceil((timestamp - now.getTime()) / 1000));
};

export const formatLocationRoomSummary = ({ room, counts, distanceMeters = null }) => ({
  _id: room._id,
  title: room.title,
  description: room.description || "",
  tags: room.tags || [],
  creator: room.creator,
  status: room.status,
  visibility: room?.visibility || LOCATION_ROOM_VISIBILITY.PUBLIC,
  type: room?.type || LOCATION_ROOM_TYPE.LOCAL,
  imageUrl: room.imageUrl || "",
  location: room.location,
  distanceKm:
    distanceMeters === null || distanceMeters === undefined
      ? null
      : Math.round((Number(distanceMeters) / 1000) * 10) / 10,
  nextMatchAt: room.nextMatchAt,
  secondsUntilNextMatch: getSecondsUntil(room.nextMatchAt),
  pinnedCount: counts?.pinnedCount || 0,
  poolCount: counts?.poolCount || 0,
  createdAt: room.createdAt,
  updatedAt: room.updatedAt,
});
