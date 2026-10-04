import Message from "../models/message.model.js";
import MatchRoom from "../models/room.model.js";
import { getBatchSize } from "../utils/batch.js";
import { MATCH_ROOM_STATUS } from "../utils/matchRoom.js";
import { deleteFile } from "./file.service.js";
import { deleteMessageMedia } from "./messageMediaCleanup.service.js";

const ARCHIVED_CHAT_RETENTION_DAYS = 7;

export const getArchivedChatCleanupCutoff = (now = new Date()) =>
  new Date(now.getTime() - ARCHIVED_CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000);

const buildExpiredArchivedRoomQuery = (cutoff) => ({
  status: MATCH_ROOM_STATUS.ARCHIVE,
  $or: [
    { archivedAt: { $lte: cutoff } },
    {
      archivedAt: null,
      updatedAt: { $lte: cutoff },
    },
  ],
});

const getRoomIdStrings = (rooms) =>
  rooms.map((room) => room._id?.toString?.() || String(room._id));

const getRoomIds = (rooms) => rooms.map((room) => room._id);

const getRoomMediaMessages = async (roomIdStrings) =>
  Message.find({
    roomId: { $in: roomIdStrings },
    $or: [
      {
        messageType: "image",
        $or: [
          { imagePublicId: { $exists: true, $ne: null } },
          { imageUrl: { $exists: true, $ne: null } },
        ],
      },
      {
        messageType: "audio",
        $or: [
          { audioPublicId: { $exists: true, $ne: null } },
          { audioUrl: { $exists: true, $ne: null } },
        ],
      },
    ],
  })
    .select("_id roomId messageType imagePublicId imageUrl audioPublicId audioUrl")
    .lean();

export const cleanupExpiredArchivedChats = async ({
  now = new Date(),
  batchSize = getBatchSize("ARCHIVED_CHAT_CLEANUP_BATCH_SIZE"),
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
  const mediaMessages = await getRoomMediaMessages(roomIdStrings);
  const { failedMessageIds = [], ...mediaResult } = await deleteMessageMedia(mediaMessages, {
    deleteMediaFile,
    logPrefix: "[ChatCleanup]",
  });
  const failedIds = new Set(failedMessageIds.map(String));
  const blockedRoomIds = new Set(
    mediaMessages
      .filter(({ _id }) => failedIds.has(String(_id)))
      .map(({ roomId }) => String(roomId)),
  );
  const deletableRoomIds = roomIds.filter((id) => !blockedRoomIds.has(String(id)));
  const deletableRoomIdStrings = deletableRoomIds.map(String);
  const messageDeleteResult = deletableRoomIds.length
    ? await Message.deleteMany({ roomId: { $in: deletableRoomIdStrings } })
    : { deletedCount: 0 };
  const roomDeleteResult = deletableRoomIds.length
    ? await MatchRoom.deleteMany({
        _id: { $in: deletableRoomIds },
        status: MATCH_ROOM_STATUS.ARCHIVE,
      })
    : { deletedCount: 0 };

  return {
    scanned: rooms.length,
    deletedRooms: roomDeleteResult.deletedCount || 0,
    deletedMessages: messageDeleteResult.deletedCount || 0,
    scannedMediaMessages: mediaMessages.length,
    ...mediaResult,
  };
};
