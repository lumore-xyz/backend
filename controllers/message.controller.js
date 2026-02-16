import MatchRoom from "../models/room.model.js";
import Message from "../models/message.model.js";
import { deleteFile, uploadImage } from "../services/file.service.js";
import { isSafeImageBuffer } from "../services/nsfw.service.js";

const isRoomParticipant = (room, userId) =>
  room?.participants?.some((id) => id.toString() === userId.toString());

const getUserId = (req) => req.user?._id?.toString();

const getAuthorizedRoom = async (roomId, userId, { requireActive = false } = {}) => {
  const room = await MatchRoom.findById(roomId).lean();
  if (!room || !isRoomParticipant(room, userId)) return null;
  if (requireActive && room.status !== "active") return "inactive";
  return room;
};

const normalizeMessageForResponse = (msg) => {
  const encryptedData = msg?.encryptedData
    ? msg.encryptedData.toString()
    : null;
  const iv = msg?.iv ? msg.iv.toString() : null;

  return {
    _id: msg?._id,
    sender: msg?.sender,
    receiver: msg?.receiver,
    roomId: msg?.roomId,
    messageType: msg?.messageType || "text",
    imageUrl: msg?.imageUrl || null,
    imagePublicId: msg?.imagePublicId || null,
    reactions: (msg?.reactions || []).map((reaction) => ({
      user: reaction.user,
      emoji: reaction.emoji || "\u2764\uFE0F",
    })),
    replyTo: msg?.replyTo || null,
    encryptedData,
    iv,
    editedAt: msg?.editedAt || null,
    createdAt: msg?.createdAt,
    updatedAt: msg?.updatedAt,
  };
};

export const getRoomMessages = async (req, res) => {
  try {
    const { roomId } = req.params;

    if (!roomId) {
      return res
        .status(400)
        .json({ message: "Invalid request: roomId required" });
    }

    const userId = getUserId(req);
    const room = await MatchRoom.findById(roomId).select("participants").lean();

    if (!room || !isRoomParticipant(room, userId)) {
      return res.status(403).json({ message: "Not authorized for this room" });
    }

    const messages = await Message.find({ roomId })
      .populate("sender", "_id name avatar")
      .populate("receiver", "_id name avatar")
      .populate({
        path: "replyTo",
        select: "_id sender messageType encryptedData iv imageUrl editedAt createdAt",
        populate: {
          path: "sender",
          select: "_id name avatar",
        },
      })
      .sort({ createdAt: 1 });

    return res.status(200).json(messages.map(normalizeMessageForResponse));
  } catch (error) {
    console.error("Error fetching room messages:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

export const uploadRoomImage = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = getUserId(req);

    if (!roomId) {
      return res.status(400).json({ message: "roomId is required" });
    }

    if (!req.file?.buffer) {
      return res.status(400).json({ message: "Image file is required" });
    }

    const room = await getAuthorizedRoom(roomId, userId, { requireActive: true });
    if (!room) {
      return res.status(403).json({ message: "Not authorized for this room" });
    }
    if (room === "inactive") {
      return res.status(400).json({ message: "Room is not active" });
    }

    const safety = await isSafeImageBuffer(req.file.buffer).catch((error) => {
      console.error("Error scanning room image:", error);
      return {
        safe: false,
        reason:
          process.env.NODE_ENV === "development"
            ? `Image safety scan failed: ${error?.message || "Unknown error"}`
            : "Image safety scan failed. Please try again.",
      };
    });

    if (!safety?.safe) {
      return res
        .status(422)
        .json({ message: safety?.reason || "Image blocked by safety policy." });
    }

    const uploaded = await uploadImage({
      buffer: req.file.buffer,
      folder: `chat/${userId}`,
      publicId: `${roomId}-${Date.now()}`,
      format: "webp",
      optimize: true,
    });

    return res.status(200).json({
      message: "Image uploaded successfully",
      imageUrl: uploaded?.secure_url,
      imagePublicId: uploaded?.public_id,
    });
  } catch (error) {
    console.error("Error uploading room image:", error);
    return res.status(500).json({ message: "Failed to upload image" });
  }
};

export const deleteTempRoomImage = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { publicId } = req.body || {};

    if (!publicId) {
      return res.status(400).json({ message: "publicId is required" });
    }

    const expectedPrefix = `chat/${userId}/`;
    if (!publicId.startsWith(expectedPrefix)) {
      return res.status(403).json({ message: "Not authorized to delete this image" });
    }

    await deleteFile(publicId, "image");

    return res.status(200).json({ message: "Image deleted successfully" });
  } catch (error) {
    console.error("Error deleting temp room image:", error);
    return res.status(500).json({ message: "Failed to delete image" });
  }
};

