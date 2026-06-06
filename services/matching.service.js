import MatchRoom from "../models/room.model.js";

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

  let room = await MatchRoom.findOne({
    participants: { $all: participants },
    $expr: { $eq: [{ $size: "$participants" }, 2] },
    ...buildSourceQuery({ source, locationRoom, locationRoomCycle }),
  });

  if (room) {
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
      subtitle: sourceMetadata.subtitle || room.sourceMetadata?.subtitle || "",
    };
    await room.save();
    return room;
  }

  room = await MatchRoom.create({
    participants,
    status: "active",
    source,
    locationRoom,
    locationRoomCycle,
    sourceMetadata,
    matchingNote,
  });

  return room;
};
