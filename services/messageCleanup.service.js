import Message from "../models/message.model.js";
import { getBatchSize } from "../utils/batch.js";
import { deleteMessageMedia } from "./messageMediaCleanup.service.js";

const MESSAGE_TTL_HOURS = 24;
const DEFAULT_BEFORE_EXPIRY_MINUTES = 5;

const getCleanupCutoff = () => {
  const configuredMinutes = Number(
    process.env.MESSAGE_IMAGE_CLEANUP_BEFORE_EXPIRY_MINUTES ||
      DEFAULT_BEFORE_EXPIRY_MINUTES
  );
  const beforeExpiryMinutes = Number.isFinite(configuredMinutes)
    ? Math.max(0, configuredMinutes)
    : DEFAULT_BEFORE_EXPIRY_MINUTES;
  const ttlMs = MESSAGE_TTL_HOURS * 60 * 60 * 1000;
  const leadMs = beforeExpiryMinutes * 60 * 1000;
  const ageMs = Math.max(0, ttlMs - leadMs);
  return new Date(Date.now() - ageMs);
};

export const cleanupExpiredMediaMessages = async () => {
  const cutoff = getCleanupCutoff();
  const batchSize = getBatchSize("MESSAGE_IMAGE_CLEANUP_BATCH_SIZE");

  const expiredMediaMessages = await Message.find({
    timestamp: { $lte: cutoff },
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
    .select("_id messageType imagePublicId imageUrl audioPublicId audioUrl")
    .sort({ timestamp: 1 })
    .limit(batchSize)
    .lean();

  if (!expiredMediaMessages.length) {
    return {
      scanned: 0,
      deletedMessages: 0,
      deletedImages: 0,
      deletedAudio: 0,
      failedImages: 0,
      failedAudio: 0,
    };
  }

  const { failedMessageIds = [], ...mediaResult } =
    await deleteMessageMedia(expiredMediaMessages);

  const failedIds = new Set(failedMessageIds.map(String));
  const messageIds = expiredMediaMessages
    .filter((item) => !failedIds.has(String(item._id)))
    .map((item) => item._id);
  const deleteResult = messageIds.length
    ? await Message.deleteMany({ _id: { $in: messageIds } })
    : { deletedCount: 0 };

  return {
    scanned: expiredMediaMessages.length,
    deletedMessages: deleteResult.deletedCount || 0,
    ...mediaResult,
  };
};
