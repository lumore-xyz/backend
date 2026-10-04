import Message from "../models/message.model.js";
import MatchRoom from "../models/room.model.js";
import { isValidObjectId } from "../utils/objectId.js";
import { isRoomParticipant, MATCH_ROOM_STATUS } from "../utils/matchRoom.js";
import { logError } from "../utils/logError.js";

export const registerMessageEditHandlers = (socket, { userId }) => {
  socket.on("edit_message", async (data) => {
    try {
      const { roomId, messageId, message } = data || {};
      if (
        !isValidObjectId(roomId) ||
        !isValidObjectId(messageId) ||
        typeof message !== "string" ||
        !message.trim()
      ) {
        return;
      }

      const room = await MatchRoom.findById(roomId).lean();
      if (
        !room ||
        !isRoomParticipant(room, userId) ||
        room.status !== MATCH_ROOM_STATUS.ACTIVE
      ) {
        return;
      }

      const messageDoc = await Message.findOne({
        _id: messageId,
        roomId,
        sender: userId,
        messageType: "text",
      });
      if (!messageDoc) return;

      messageDoc.message = message.trim();
      messageDoc.editedAt = new Date();
      await messageDoc.save();

      socket.nsp.to(roomId).emit("message_edited", {
        roomId,
        messageId: messageDoc._id.toString(),
        message: messageDoc.message,
        editedAt: messageDoc.editedAt,
      });
    } catch (error) {
      logError("Socket edit_message failed", error);
      socket.emit("error", { message: "Unable to edit message" });
    }
  });
};
