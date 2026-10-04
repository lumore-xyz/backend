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
  creator: room.creator,
  status: room.status,
  visibility: room?.visibility || LOCATION_ROOM_VISIBILITY.PUBLIC,
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
