import Message from "../models/message.model.js";
import MatchRoom from "../models/room.model.js";
import { deleteFile } from "./file.service.js";

export const ARCHIVED_CHAT_RETENTION_DAYS = 7;

const DEFAULT_BATCH_SIZE = 100;

const getBatchSize = () =>
  Math.max(
    1,
    Number(process.env.ARCHIVED_CHAT_CLEANUP_BATCH_SIZE || DEFAULT_BATCH_SIZE),
  );

export const getArchivedChatCleanupCutoff = (now = new Date()) =>
  new Date(now.getTime() - ARCHIVED_CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000);

export const buildExpiredArchivedRoomQuery = (cutoff) => ({
  status: "archive",
  $or: [
    { archivedAt: { $lte: cutoff } },
    {
      archivedAt: null,
      updatedAt: { $lte: cutoff },
    },
    {
      archivedAt: { $exists: false },
      updatedAt: { $lte: cutoff },
    },
  ],
});

const getRoomIdStrings = (rooms) =>
  rooms.map((room) => room._id?.toString?.() || String(room._id));

const getRoomIds = (rooms) => rooms.map((room) => room._id);

const deleteMessageMedia = async ({ roomIdStrings, deleteMediaFile }) => {
  const mediaMessages = await Message.find({
    roomId: { $in: roomIdStrings },
    $or: [
      {
        messageType: "image",
        imagePublicId: { $exists: true, $ne: null },
      },
      {
        messageType: "audio",
        audioPublicId: { $exists: true, $ne: null },
      },
    ],
  })
    .select("_id messageType imagePublicId audioPublicId")
    .lean();

  let deletedImages = 0;
  let deletedAudio = 0;
  let failedImages = 0;
  let failedAudio = 0;

  for (const message of mediaMessages) {
    const isAudio = message.messageType === "audio";
    const publicId = isAudio ? message.audioPublicId : message.imagePublicId;
    if (!publicId) continue;

    try {
      await deleteMediaFile(publicId, isAudio ? "video" : "image");
      if (isAudio) deletedAudio += 1;
      else deletedImages += 1;
    } catch (error) {
      if (isAudio) failedAudio += 1;
      else failedImages += 1;
      console.error("[ChatCleanup] Failed deleting archived chat media:", {
        messageId: message._id?.toString?.() || message._id,
        publicId,
        resourceType: isAudio ? "video" : "image",
        error: error?.message || error,
      });
    }
  }

  return {
    scannedMediaMessages: mediaMessages.length,
    deletedImages,
    deletedAudio,
    failedImages,
    failedAudio,
  };
};

export const cleanupExpiredArchivedChats = async ({
  now = new Date(),
  batchSize = getBatchSize(),
  deleteMediaFile = deleteFile,
} = {}) => {
  const cutoff = getArchivedChatCleanupCutoff(now);
  const rooms = await MatchRoom.find(buildExpiredArchivedRoomQuery(cutoff))
    .select("_id")
    .sort({ archivedAt: 1, updatedAt: 1 })
    .limit(batchSize)
    .lean();

  if (!rooms.length) {
    return {
      scanned: 0,
      deletedRooms: 0,
      deletedMessages: 0,
      scannedMediaMessages: 0,
      deletedImages: 0,
      deletedAudio: 0,
      failedImages: 0,
      failedAudio: 0,
    };
  }

  const roomIds = getRoomIds(rooms);
  const roomIdStrings = getRoomIdStrings(rooms);
  const mediaResult = await deleteMessageMedia({
    roomIdStrings,
    deleteMediaFile,
  });
  const messageDeleteResult = await Message.deleteMany({
    roomId: { $in: roomIdStrings },
  });
  const roomDeleteResult = await MatchRoom.deleteMany({
    _id: { $in: roomIds },
    status: "archive",
  });

  return {
    scanned: rooms.length,
    deletedRooms: roomDeleteResult.deletedCount || 0,
    deletedMessages: messageDeleteResult.deletedCount || 0,
    ...mediaResult,
  };
};
