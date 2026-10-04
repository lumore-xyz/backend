import {
  getMatchRoomForUser,
  getMatchRoomInbox,
} from "../services/matchRoomRead.service.js";

export const getInbox = async (req, res) => {
  const { data, pagination } = await getMatchRoomInbox({
    userId: req.user._id,
    query: req.query,
  });

  if (!pagination) return res.status(200).json(data);
  return res.status(200).json({ data, pagination });
};

export const getRoomData = async (req, res) => {
  const result = await getMatchRoomForUser({
    roomId: req.params.roomId,
    userId: req.user._id,
  });

  if (result.error === "ROOM_NOT_FOUND") {
    return res.status(404).json({ message: "Room not found" });
  }
  if (result.error === "FORBIDDEN") {
    return res.status(403).json({ message: "Not authorized for this room" });
  }
  return res.status(200).json(result.room);
};
