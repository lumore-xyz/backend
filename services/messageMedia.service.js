import MatchRoom from "../models/room.model.js";
import {
  isRoomParticipant,
  MATCH_ROOM_STATUS,
} from "../utils/matchRoom.js";
import {
  deleteFile,
  uploadAudio,
  uploadImage,
} from "./file.service.js";

const getActiveRoomError = async (roomId, userId) => {
  const room = await MatchRoom.findById(roomId)
    .select("participants status")
    .lean();
  if (!room || !isRoomParticipant(room, userId)) return "NOT_AUTHORIZED";
  if (room.status !== MATCH_ROOM_STATUS.ACTIVE) return "ROOM_INACTIVE";
  return null;
};

export const isRoomMediaOwned = ({ roomId, userId, publicId, type }) => {
  const folder = type === "audio" ? "chat-audio" : "chat";
  return typeof publicId === "string" && publicId.startsWith(`${folder}/${userId}/${roomId}-`);
};

export const uploadRoomImage = async ({ roomId, userId, buffer }) => {
  const error = await getActiveRoomError(roomId, userId);
  if (error) return { error };

  const uploaded = await uploadImage({
    buffer,
    folder: `chat/${userId}`,
    publicId: `${roomId}-${Date.now()}`,
  });
  return { imageUrl: uploaded?.secure_url, imagePublicId: uploaded?.public_id };
};

export const uploadRoomAudio = async ({ roomId, userId, buffer, durationMs }) => {
  const error = await getActiveRoomError(roomId, userId);
  if (error) return { error };

  const uploaded = await uploadAudio({
    buffer,
    folder: `chat-audio/${userId}`,
    publicId: `${roomId}-${Date.now()}`,
  });
  return {
    audioUrl: uploaded?.secure_url,
    audioPublicId: uploaded?.public_id,
    audioDurationMs: Math.round(durationMs),
  };
};

export const deleteTemporaryRoomMedia = async ({ userId, publicId, type }) => {
  const folder = type === "audio" ? "chat-audio" : "chat";
  if (
    typeof publicId !== "string" ||
    !publicId.startsWith(`${folder}/${userId}/`)
  ) {
    return false;
  }
  await deleteFile(publicId, type === "audio" ? "video" : "image");
  return true;
};
