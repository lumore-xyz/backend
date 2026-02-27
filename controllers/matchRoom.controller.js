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

const getUnreadCountForUser = (unreadCounts, userId) => {
  if (!unreadCounts) return 0;

  if (unreadCounts instanceof Map) {
    return Number(unreadCounts.get(userId) || 0);
  }

  if (typeof unreadCounts.get === "function") {
    return Number(unreadCounts.get(userId) || 0);
  }

  if (typeof unreadCounts === "object") {
    for (const [key, value] of Object.entries(unreadCounts)) {
      if (String(key) === String(userId)) {
        return Number(value || 0);
      }
    }
  }

  return 0;
};

export const getInbox = async (req, res) => {
  const userId = req.user._id;
  const currentUserId = userId.toString();
  const status = req.query.status;
  const rooms = await MatchRoom.find({
    participants: userId,
    status: status || "",
  })
    .sort({ lastMessageAt: -1 })
    .populate("participants", "_id username nickname profilePicture")
    .lean();

  const normalized = rooms.map((room) => {
    const previewType =
      room?.lastMessage?.previewType ||
      (room?.lastMessage?.messageType === "image" ? "image" : "none");
    const safeLastMessage = room?.lastMessage
      ? {
          ...room.lastMessage,
          message: room?.lastMessage?.message || null,
        }
      : null;

    return {
      ...room,
      lastMessage: safeLastMessage,
      unreadCount: getUnreadCountForUser(room?.unreadCounts, currentUserId),
    };
  });

  res.status(200).json(normalized);
};

export const getRoomData = async (req, res) => {
  const userId = req.user._id;
  const { roomId } = req.params;

  const room = await MatchRoom.findById(roomId)
    .populate("participants", "_id username nickname profilePicture")
    .lean();

  if (!room) {
    return res.status(404).json({ message: "Room not found" });
  }
  if (
    !room.participants?.some(
      (participant) => participant?._id?.toString() === userId.toString()
    )
  ) {
    return res.status(403).json({ message: "Not authorized for this room" });
  }

  const previewType =
    room?.lastMessage?.previewType ||
    (room?.lastMessage?.messageType === "image" ? "image" : "none");
  if (room.lastMessage && previewType === "text") {
    room.lastMessage.message = room?.lastMessage?.message || null;
  }

  res.status(200).json(room);
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
      returnDocument: "after",
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

export const getReceivedFeedbacks = async (req, res) => {
  try {
    const userId = req.user._id;

    const feedbacks = await RejectedProfile.find({
      rejectedUser: userId,
      feedback: { $exists: true, $ne: "" },
    })
      .populate("user", "_id username nickname profilePicture")
      .populate("roomId", "_id createdAt")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json(feedbacks);
  } catch (error) {
    console.error("[feedback] getReceivedFeedbacks failed:", error);
    return res.status(500).json({ message: "Failed to fetch received feedbacks" });
  }
};

