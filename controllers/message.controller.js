import {
  getMessagesForRoom,
} from "../services/messageApi.service.js";
import {
  deleteTemporaryRoomMedia,
  uploadRoomAudio as saveRoomAudio,
  uploadRoomImage as saveRoomImage,
} from "../services/messageMedia.service.js";
import { logError } from "../utils/logError.js";

const getUserId = (req) => req.user?._id?.toString();

export const getRoomMessages = async (req, res) => {
  try {
    const { roomId } = req.params;
    const messages = await getMessagesForRoom({ roomId, userId: getUserId(req) });
    if (!messages) {
      return res.status(403).json({ message: "Not authorized for this room" });
    }
    return res.status(200).json(messages);
  } catch (error) {
    logError("Error fetching room messages", error);
    return res.status(500).json({ message: "Server error" });
  }
};

export const uploadRoomImage = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = getUserId(req);
    if (!req.file?.buffer) {
      return res.status(400).json({ message: "Image file is required" });
    }

    const result = await saveRoomImage({
      roomId,
      userId,
      buffer: req.file.buffer,
    });
    if (result.error === "NOT_AUTHORIZED") {
      return res.status(403).json({ message: "Not authorized for this room" });
    }
    if (result.error === "ROOM_INACTIVE") {
      return res.status(400).json({ message: "Room is not active" });
    }
    return res.status(200).json({
      message: "Image uploaded successfully",
      ...result,
    });
  } catch (error) {
    logError("Error uploading room image", error);
    return res.status(500).json({ message: "Failed to upload image" });
  }
};

export const uploadRoomAudio = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = getUserId(req);
    const durationMs = Number(req.body?.durationMs || 0);
    if (!req.file?.buffer) {
      return res.status(400).json({ message: "Audio file is required" });
    }
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      return res.status(400).json({ message: "durationMs is required" });
    }

    const result = await saveRoomAudio({
      roomId,
      userId,
      buffer: req.file.buffer,
      durationMs,
    });
    if (result.error === "NOT_AUTHORIZED") {
      return res.status(403).json({ message: "Not authorized for this room" });
    }
    if (result.error === "ROOM_INACTIVE") {
      return res.status(400).json({ message: "Room is not active" });
    }
    return res.status(200).json({
      message: "Audio uploaded successfully",
      ...result,
    });
  } catch (error) {
    logError("Error uploading room audio", error);
    return res.status(500).json({ message: "Failed to upload audio" });
  }
};

const deleteTempMedia = async (req, res, type) => {
  const noun = type === "audio" ? "audio" : "image";
  const title = noun[0].toUpperCase() + noun.slice(1);
  try {
    const userId = getUserId(req);
    const { publicId } = req.body || {};
    if (!publicId) {
      return res.status(400).json({ message: "publicId is required" });
    }
    if (!(await deleteTemporaryRoomMedia({ userId, publicId, type }))) {
      return res.status(403).json({ message: `Not authorized to delete this ${noun}` });
    }
    return res.status(200).json({ message: `${title} deleted successfully` });
  } catch (error) {
    logError(`Error deleting temp room ${noun}`, error);
    return res.status(500).json({ message: `Failed to delete ${noun}` });
  }
};

export const deleteTempRoomImage = (req, res) => deleteTempMedia(req, res, "image");
export const deleteTempRoomAudio = (req, res) => deleteTempMedia(req, res, "audio");
