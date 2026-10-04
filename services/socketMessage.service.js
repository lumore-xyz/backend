import Message from "../models/message.model.js";
import MatchRoom from "../models/room.model.js";
import { idsEqual, isValidObjectId } from "../utils/objectId.js";
import {
  DEFAULT_REACTION_EMOJI,
  MESSAGE_TYPES,
} from "../utils/message.js";
import {
  getOtherParticipantId,
  isRoomParticipant,
  MATCH_ROOM_STATUS,
} from "../utils/matchRoom.js";
import { isRoomMediaOwned } from "./messageMedia.service.js";
import { sendNotificationToUser } from "./push.service.js";
import { logError } from "../utils/logError.js";

const normalizeReplyMessage = (replyDoc) => {
  if (!replyDoc) return null;
  return {
    _id: replyDoc._id?.toString(),
    senderId: replyDoc.sender?._id
      ? replyDoc.sender._id.toString()
      : replyDoc.sender?.toString?.() || null,
    message: replyDoc.message || "",
    messageType: replyDoc.messageType || "text",
    imageUrl: replyDoc.imageUrl || null,
    audioUrl: replyDoc.audioUrl || null,
    audioDurationMs: replyDoc.audioDurationMs || null,
    audioWaveform: Array.isArray(replyDoc.audioWaveform)
      ? replyDoc.audioWaveform
      : [],
    editedAt: replyDoc.editedAt || null,
    createdAt: replyDoc.createdAt || null,
  };
};

const normalizeMessagePayload = (messageDoc, extra = {}) => ({
  _id: messageDoc._id.toString(),
  roomId: messageDoc.roomId,
  senderId: messageDoc.sender?.toString?.() || null,
  receiverId: messageDoc.receiver?.toString?.() || null,
  messageType: messageDoc.messageType || "text",
  message: messageDoc.message || "",
  imageUrl: messageDoc.imageUrl || null,
  imagePublicId: messageDoc.imagePublicId || null,
  audioUrl: messageDoc.audioUrl || null,
  audioPublicId: messageDoc.audioPublicId || null,
  audioDurationMs: messageDoc.audioDurationMs || null,
  audioWaveform: Array.isArray(messageDoc.audioWaveform)
    ? messageDoc.audioWaveform
    : [],
  replyTo: normalizeReplyMessage(messageDoc.replyTo),
  reactions: (messageDoc.reactions || []).map((reaction) => ({
    userId: reaction.user?.toString?.() || null,
    emoji: reaction.emoji || DEFAULT_REACTION_EMOJI,
  })),
  editedAt: messageDoc.editedAt || null,
  deliveredAt: messageDoc.deliveredAt || null,
  readAt: messageDoc.readAt || null,
  createdAt: messageDoc.createdAt,
  timestamp: new Date(messageDoc.createdAt).getTime(),
  ...extra,
});

export const registerMessageHandlers = (socket, { userId }) => {
  socket.on("send_message", async (data) => {
    try {
      const {
        roomId,
        message: messageText,
        replyTo,
        messageType = "text",
        imageUrl = null,
        imagePublicId = null,
        audioUrl = null,
        audioPublicId = null,
        audioDurationMs = null,
        audioWaveform = [],
        clientMessageId = null,
      } = data || {};

      if (
        !isValidObjectId(roomId) ||
        (replyTo && !isValidObjectId(replyTo))
      ) {
        return;
      }
      if (!MESSAGE_TYPES.includes(messageType)) return;
      if (
        messageType === "text" &&
        (typeof messageText !== "string" || !messageText.trim())
      ) {
        return;
      }
      if (
        messageType === "image" &&
        (typeof imageUrl !== "string" ||
          !imageUrl.trim() ||
          !isRoomMediaOwned({
            roomId,
            userId,
            publicId: imagePublicId,
            type: "image",
          }))
      ) {
        return;
      }
      if (
        messageType === "audio" &&
        (typeof audioUrl !== "string" ||
          !audioUrl.trim() ||
          !isRoomMediaOwned({
            roomId,
            userId,
            publicId: audioPublicId,
            type: "audio",
          }))
      ) {
        return;
      }
      const normalizedAudioDurationMs =
        messageType === "audio" ? Number(audioDurationMs) : null;
      if (
        messageType === "audio" &&
        (!Number.isFinite(normalizedAudioDurationMs) ||
          normalizedAudioDurationMs <= 0)
      ) {
        return;
      }

      const room = await MatchRoom.findById(roomId).lean();
      if (!room) return;
      if (!isRoomParticipant(room, userId)) return;
      if (room.status !== MATCH_ROOM_STATUS.ACTIVE) return;
      const receiverId = getOtherParticipantId(room, userId);
      if (!receiverId) return;

      let replyMessage = null;
      if (replyTo) {
        replyMessage = await Message.findOne({ _id: replyTo, roomId })
          .select("_id sender messageType message imageUrl audioUrl audioDurationMs audioWaveform editedAt createdAt")
          .lean();
      }

      const receiverSockets = await socket.nsp.in(receiverId).fetchSockets();
      const receiverInRoom = receiverSockets.some((receiverSocket) =>
        receiverSocket.rooms.has(roomId),
      );
      const now = new Date();

      const createdMessage = await Message.create({
        sender: userId,
        receiver: receiverId,
        roomId,
        messageType,
        message: messageType === "text" ? messageText : null,
        imageUrl: messageType === "image" ? imageUrl : null,
        imagePublicId: messageType === "image" ? imagePublicId : null,
        audioUrl: messageType === "audio" ? audioUrl : null,
        audioPublicId: messageType === "audio" ? audioPublicId : null,
        audioDurationMs: normalizedAudioDurationMs,
        audioWaveform:
          messageType === "audio" && Array.isArray(audioWaveform)
            ? audioWaveform.map(Number).filter(Number.isFinite).slice(0, 72)
            : [],
        replyTo: replyMessage?._id || null,
        deliveredAt: receiverInRoom ? now : null,
        readAt: receiverInRoom ? now : null,
      });

      const payload = normalizeMessagePayload(
        {
          ...createdMessage.toObject(),
          replyTo: replyMessage,
        },
        { clientMessageId },
      );

      socket.to(roomId).emit("new_message", payload);
      socket.emit("message_sent", payload);

      if (receiverInRoom) {
        socket.emit("message_delivered", {
          roomId,
          messageIds: [createdMessage._id.toString()],
          deliveredAt: now.toISOString(),
        });
        socket.emit("message_read", {
          roomId,
          messageIds: [createdMessage._id.toString()],
          readAt: now.toISOString(),
        });
      }

      const unreadIncrements = {};
      for (const participantId of room.participants || []) {
        const pid = participantId.toString();
        if (
          !idsEqual(pid, userId) &&
          !(receiverInRoom && idsEqual(pid, receiverId))
        ) {
          unreadIncrements[`unreadCounts.${pid}`] = 1;
        }
      }

      await MatchRoom.findByIdAndUpdate(roomId, {
        $set: {
          lastMessageAt: now,
          lastMessage: {
            sender: userId,
            messageType,
            message: messageType === "text" ? messageText : null,
            previewType:
              messageType === "image"
                ? "image"
                : messageType === "audio"
                  ? "audio"
                : messageType === "text"
                  ? "text"
                  : "none",
            imageUrl: messageType === "image" ? imageUrl : null,
            audioUrl: messageType === "audio" ? audioUrl : null,
            audioDurationMs: normalizedAudioDurationMs,
            createdAt: now,
          },
        },
        ...(Object.keys(unreadIncrements).length
          ? { $inc: unreadIncrements }
          : {}),
      });

      socket.emit("inbox_updated", {
        roomId,
        status: room.status,
      });

      socket.nsp.to(receiverId).emit("inbox_updated", {
        roomId,
        status: room.status,
      });

      await sendNotificationToUser(receiverId, {
        title: "New message",
        body: "You received a new message on Lumore.",
        tag: `message-${roomId}`,
        data: {
          type: "message",
          roomId,
          senderId: userId,
          url: `/app/chat/${roomId}`,
        },
      });
    } catch (error) {
      logError("Socket send_message failed", error);
      socket.emit("error", { message: "Unable to send message" });
    }
  });

};
