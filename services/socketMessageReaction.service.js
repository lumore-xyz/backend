import Message from "../models/message.model.js";
import MatchRoom from "../models/room.model.js";
import { idsEqual, isValidObjectId } from "../utils/objectId.js";
import {
  DEFAULT_REACTION_EMOJI,
  MAX_REACTION_LENGTH,
} from "../utils/message.js";
import {
  isRoomParticipant,
  MATCH_ROOM_STATUS,
} from "../utils/matchRoom.js";
import { logError } from "../utils/logError.js";

export const registerMessageReactionHandlers = (socket, { userId }) => {
  socket.on("toggle_message_reaction", async (data) => {
    try {
      const { roomId, messageId } = data || {};
      const emoji = data?.emoji ?? DEFAULT_REACTION_EMOJI;
      if (
        !isValidObjectId(roomId) ||
        !isValidObjectId(messageId) ||
        typeof emoji !== "string" ||
        !emoji.trim() ||
        emoji.length > MAX_REACTION_LENGTH
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

      const message = await Message.findOne({ _id: messageId, roomId });
      if (!message) return;

      const existingIndex = message.reactions.findIndex(
        (reaction) => idsEqual(reaction.user, userId),
      );

      if (existingIndex >= 0) {
        if (message.reactions[existingIndex].emoji === emoji) {
          message.reactions.splice(existingIndex, 1);
        } else {
          message.reactions[existingIndex].emoji = emoji;
        }
      } else {
        message.reactions.push({
          user: userId,
          emoji,
        });
      }

      await message.save();

      socket.nsp.to(roomId).emit("message_reaction_updated", {
        roomId,
        messageId: message._id.toString(),
        reactions: (message.reactions || []).map((reaction) => ({
          userId: reaction.user.toString(),
          emoji: reaction.emoji || DEFAULT_REACTION_EMOJI,
        })),
      });
    } catch (error) {
      logError("Socket toggle_message_reaction failed", error);
      socket.emit("error", { message: "Unable to update reaction" });
    }
  });
};
