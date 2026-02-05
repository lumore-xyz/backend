import RejectedProfile from "../models/reject.model.js";
import Report from "../models/report.model.js";
import MatchRoom from "../models/room.model.js";

const getOtherParticipantId = (room, userId) => {
  if (!room?.participants?.length) return null;
  return (
    room.participants.find(
      (participant) => participant.toString() !== userId.toString()
    ) ?? null
  );
};

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

export const submitChatFeedback = async (req, res) => {
  const userId = req.user._id;
  const { roomId } = req.params;
  const { feedback, rating, reason } = req.body;

  const room = await MatchRoom.findById(roomId).lean();
  if (!room) {
    return res.status(404).json({ message: "Room not found" });
  }

  const rejectedUser = getOtherParticipantId(room, userId);
  if (!rejectedUser) {
    return res.status(400).json({ message: "Invalid room participants" });
  }

  const payload = {
    user: userId,
    rejectedUser,
    roomId,
    feedback: feedback?.trim() || "",
    reason: reason?.trim() || "",
  };

  if (rating !== undefined) {
    payload.rating = rating;
  }

  const saved = await RejectedProfile.findOneAndUpdate(
    { user: userId, rejectedUser, roomId },
    payload,
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

  res.status(200).json(saved);
};

export const reportChatUser = async (req, res) => {
  const userId = req.user._id;
  const { roomId } = req.params;
  const { category, reason, details } = req.body;

  const room = await MatchRoom.findById(roomId).lean();
  if (!room) {
    return res.status(404).json({ message: "Room not found" });
  }

  const reportedUser = getOtherParticipantId(room, userId);
  if (!reportedUser) {
    return res.status(400).json({ message: "Invalid room participants" });
  }

  if (!category) {
    return res.status(400).json({ message: "Report category is required" });
  }

  const report = await Report.create({
    reporter: userId,
    reportedUser,
    roomId,
    category,
    reason: reason?.trim() || "Report from chat",
    details: details?.trim() || "",
  });

  res.status(201).json(report);
};
