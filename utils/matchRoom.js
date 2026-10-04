import { getId } from "./matchIds.js";
import { idsEqual } from "./objectId.js";

export const MATCH_ROOM_SOURCE = Object.freeze({
  EXPLORE: "explore",
  LOCATION_ROOM: "location_room",
});
export const MATCH_ROOM_SOURCES = Object.freeze(Object.values(MATCH_ROOM_SOURCE));

export const MATCH_ROOM_STATUS = Object.freeze({
  ACTIVE: "active",
  ARCHIVE: "archive",
});

export const MATCH_ROOM_STATUSES = Object.freeze(
  Object.values(MATCH_ROOM_STATUS),
);

export const isRoomParticipant = (room, userId) =>
  Boolean(
    userId &&
      room?.participants?.some((participant) =>
        idsEqual(participant?._id ?? participant, userId),
      ),
  );

export const getOtherParticipantId = (room, userId) => {
  if (room?.participants?.length !== 2 || !isRoomParticipant(room, userId)) {
    return null;
  }

  const otherParticipant = room.participants.find(
    (participant) => !idsEqual(participant?._id ?? participant, userId),
  );
  return otherParticipant ? getId(otherParticipant) || null : null;
};
