import MatchRoom from "../models/room.model.js";
import { idsEqual, isValidObjectId } from "../utils/objectId.js";
import {
  getOtherParticipantId,
  isRoomParticipant,
  MATCH_ROOM_STATUS,
} from "../utils/matchRoom.js";
import { logError } from "../utils/logError.js";
import { markRoomMessagesReadAndDelivered } from "./messageReceipt.service.js";

const isJoinedChatRoom = (socket, roomId, userId) =>
  isValidObjectId(roomId) &&
  !idsEqual(roomId, userId) &&
  socket.rooms.has(String(roomId));

export const registerChatRoomHandlers = (socket, { userId }) => {
  socket.on("joinChat", async (data) => {
    const roomId = data?.roomId;
    if (!isValidObjectId(roomId)) return;

    try {
      const room = await MatchRoom.findById(roomId).lean();
      if (
        !room ||
        room.status !== MATCH_ROOM_STATUS.ACTIVE ||
        !isRoomParticipant(room, userId)
      ) {
        return;
      }
      socket.join(roomId);
      await markRoomMessagesReadAndDelivered({
        roomId,
        userId,
        emit: (event, payload) => socket.nsp.to(roomId).emit(event, payload),
      });
      await MatchRoom.findByIdAndUpdate(roomId, {
        $set: { [`unreadCounts.${userId}`]: 0 },
      });
      socket.emit("inbox_updated", {
        roomId,
        status: room.status,
      });
    } catch (error) {
      logError("Socket joinChat failed", error);
    }
  });

  socket.on("leaveChat", (data) => {
    const roomId = data?.roomId;
    if (!isJoinedChatRoom(socket, roomId, userId)) return;
    socket.leave(roomId);
  });

  // ==================== CHAT CANCELLATION ====================

  socket.on("endChat", async (data) => {
    const roomId = data?.roomId;
    if (!isValidObjectId(roomId)) return;

    try {
      const room = await MatchRoom.findById(roomId);
      if (
        !room ||
        room.status !== MATCH_ROOM_STATUS.ACTIVE ||
        !isRoomParticipant(room, userId)
      ) {
        return;
      }

      room.status = MATCH_ROOM_STATUS.ARCHIVE;
      room.endedBy = userId;
      room.archivedAt = room.archivedAt || new Date();
      await room.save();

      socket.to(roomId).emit("chatEnded", {
        endedBy: userId,
      });
      await socket.nsp.in(roomId).socketsLeave(roomId);
    } catch (error) {
      logError("Socket endChat failed", error);
      socket.emit("error", { message: "Unable to end chat" });
    }
  });

  socket.on("typing", (data) => {
    const { roomId, isTyping } = data || {};
    if (!isJoinedChatRoom(socket, roomId, userId)) return;
    const roomKey = String(roomId);
    socket
      .to(roomKey)
      .emit("typing", { roomId: roomKey, userId, isTyping: Boolean(isTyping) });
  });
};
