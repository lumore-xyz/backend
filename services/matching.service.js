import MatchRoom from "../models/room.model.js";

export const getOrCreateMatchRoom = async (userId1, userId2) => {
  const participants = [userId1, userId2].sort(); // IMPORTANT

  let room = await MatchRoom.findOne({
    participants: { $all: participants },
  });

  if (room) {
    // Re-open if previously ended
    if (room.status !== "active") {
      room.status = "active";
      room.endedBy = null;
      await room.save();
    }
    return room;
  }

  room = await MatchRoom.create({
    participants,
    status: "active",
  });

  return room;
};
