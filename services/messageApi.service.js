import MatchRoom from "../models/room.model.js";
import Message from "../models/message.model.js";
import { isRoomParticipant } from "../utils/matchRoom.js";
import { markRoomMessagesReadAndDelivered } from "./messageReceipt.service.js";
import socketService from "./socket.service.js";

const normalizeReply = (reply) => {
  if (!reply) return null;
  return {
    _id: reply._id,
    sender: reply.sender,
    messageType: reply.messageType || "text",
    message: reply.message || "",
    imageUrl: reply.imageUrl || null,
    audioUrl: reply.audioUrl || null,
    audioDurationMs: reply.audioDurationMs || null,
    audioWaveform: Array.isArray(reply.audioWaveform) ? reply.audioWaveform : [],
    editedAt: reply.editedAt || null,
    createdAt: reply.createdAt || null,
  };
};

const normalizeMessage = (message) => ({
  _id: message?._id,
  sender: message?.sender,
  receiver: message?.receiver,
  roomId: message?.roomId,
  messageType: message?.messageType || "text",
  message: message?.message || "",
  imageUrl: message?.imageUrl || null,
  imagePublicId: message?.imagePublicId || null,
  audioUrl: message?.audioUrl || null,
  audioPublicId: message?.audioPublicId || null,
  audioDurationMs: message?.audioDurationMs || null,
  audioWaveform: Array.isArray(message?.audioWaveform) ? message.audioWaveform : [],
  reactions: (message?.reactions || []).map((reaction) => ({
    user: reaction.user,
    emoji: reaction.emoji || "\u2764\uFE0F",
  })),
  replyTo: normalizeReply(message?.replyTo),
  editedAt: message?.editedAt || null,
  deliveredAt: message?.deliveredAt || null,
  readAt: message?.readAt || null,
  createdAt: message?.createdAt,
  updatedAt: message?.updatedAt,
});

export const getMessagesForRoom = async ({ roomId, userId }) => {
  const room = await MatchRoom.findById(roomId).select("participants").lean();
  if (!room || !isRoomParticipant(room, userId)) return null;

  await markRoomMessagesReadAndDelivered({
    roomId,
    userId,
    emit: (event, payload) => socketService.emitToRoom(roomId, event, payload),
  });
  await MatchRoom.findByIdAndUpdate(roomId, {
    $set: { [`unreadCounts.${userId}`]: 0 },
  });

  const messages = await Message.find({ roomId })
    .populate("sender", "_id name avatar")
    .populate("receiver", "_id name avatar")
    .populate({
      path: "replyTo",
      select: "_id sender messageType message imageUrl audioUrl audioDurationMs audioWaveform editedAt createdAt",
      populate: { path: "sender", select: "_id name avatar" },
    })
    .sort({ createdAt: 1 });

  return messages.map(normalizeMessage);
};
