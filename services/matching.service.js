import MatchRoom from "../models/room.model.js";

const MATCH_ROOM_LOG_PREFIX = "[match-room]";

const getSortedParticipants = (userId1, userId2) =>
  [userId1, userId2].map((id) => id.toString()).sort();

const buildSourceQuery = ({ source, locationRoom, locationRoomCycle }) => {
  if (source === "location_room") {
    return {
      source,
      locationRoom,
      locationRoomCycle,
    };
  }

  return {
    $or: [{ source: "explore" }, { source: { $exists: false } }],
  };
};

const logMatchRoomStep = (stage, details = {}) => {
  console.info(`${MATCH_ROOM_LOG_PREFIX} ${stage}`, details);
};

export const getOrCreateMatchRoom = async (
  userId1,
  userId2,
  matchingNote = null,
  options = {},
) => {
  const participants = getSortedParticipants(userId1, userId2);
  const source = options.source || "explore";
  const locationRoom = options.locationRoom || null;
  const locationRoomCycle = options.locationRoomCycle || null;
  const sourceMetadata = options.sourceMetadata || {};

  logMatchRoomStep("lookup_start", {
    userId1: participants[0] || null,
    userId2: participants[1] || null,
    source,
    locationRoom: locationRoom?.toString?.() || locationRoom || null,
    locationRoomCycle:
      locationRoomCycle?.toString?.() || locationRoomCycle || null,
    hasMatchingNote: Boolean(matchingNote),
  });

  try {
    let room = await MatchRoom.findOne({
      participants: { $all: participants },
      $expr: { $eq: [{ $size: "$participants" }, 2] },
      ...buildSourceQuery({ source, locationRoom, locationRoomCycle }),
    });

    if (room) {
      logMatchRoomStep("existing_room_found", {
        roomId: room._id.toString(),
        status: room.status,
      });

      // Re-open if previously ended
      if (room.status !== "active") {
        room.status = "active";
        room.endedBy = null;
      }
      if (matchingNote) {
        room.matchingNote = matchingNote;
      }
      room.source = source;
      room.locationRoom = locationRoom;
      room.locationRoomCycle = locationRoomCycle;
      room.sourceMetadata = {
        title: sourceMetadata.title || room.sourceMetadata?.title || "",
        subtitle:
          sourceMetadata.subtitle || room.sourceMetadata?.subtitle || "",
      };
      await room.save();

      logMatchRoomStep("existing_room_saved", {
        roomId: room._id.toString(),
        status: room.status,
      });
      return room;
    }

    logMatchRoomStep("creating_new_room", {
      participants,
      source,
    });

    room = await MatchRoom.create({
      participants,
      status: "active",
      source,
      locationRoom,
      locationRoomCycle,
      sourceMetadata,
      matchingNote,
    });

    logMatchRoomStep("new_room_created", {
      roomId: room._id.toString(),
      status: room.status,
    });

    return room;
  } catch (error) {
    console.error(`${MATCH_ROOM_LOG_PREFIX} error`, {
      participants,
      source,
      message: error?.message || "unknown_error",
      stack: error?.stack || null,
    });
    throw error;
  }
};
