import MatchRoom from "../models/room.model.js";

export const getInbox = async (req, res) => {
  const userId = req.user._id;
  const status = req.query.status;
  const rooms = await MatchRoom.find({
    participants: userId,
    status: status || "",
  })
    .sort({ lastMessageAt: -1 })
    .populate("participants", "_id username nickname profilePicture")
    .lean();

  res.status(200).json(rooms);
};

export const getRoomData = async (req, res) => {
  // const userId = req.user._id;
  const { roomId } = req.params;

  const rooms = await MatchRoom.findById(roomId)
    .sort({ lastMessageAt: -1 })
    .populate("participants", "_id username nickname profilePicture")
    .lean();

  res.status(200).json(rooms);
};
