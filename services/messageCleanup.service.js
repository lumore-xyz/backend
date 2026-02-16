import Message from "../models/message.model.js";
import { deleteFile } from "./file.service.js";

const MESSAGE_TTL_HOURS = 24;
const DEFAULT_BEFORE_EXPIRY_MINUTES = 5;
const DEFAULT_BATCH_SIZE = 100;

const getCleanupCutoff = () => {
  const beforeExpiryMinutes = Number(
    process.env.MESSAGE_IMAGE_CLEANUP_BEFORE_EXPIRY_MINUTES ||
      DEFAULT_BEFORE_EXPIRY_MINUTES
  );
  const ttlMs = MESSAGE_TTL_HOURS * 60 * 60 * 1000;
  const leadMs = Math.max(0, beforeExpiryMinutes) * 60 * 1000;
  const ageMs = Math.max(0, ttlMs - leadMs);
  return new Date(Date.now() - ageMs);
};

const getBatchSize = () =>
  Math.max(1, Number(process.env.MESSAGE_IMAGE_CLEANUP_BATCH_SIZE || DEFAULT_BATCH_SIZE));

export const cleanupExpiredImageMessages = async () => {
  const cutoff = getCleanupCutoff();
  const batchSize = getBatchSize();

  const expiredImageMessages = await Message.find({
    messageType: "image",
    imagePublicId: { $exists: true, $ne: null },
    timestamp: { $lte: cutoff },
  })
    .select("_id imagePublicId")
    .sort({ timestamp: 1 })
    .limit(batchSize)
    .lean();

  if (!expiredImageMessages.length) {
    return {
      scanned: 0,
      deletedMessages: 0,
      deletedImages: 0,
      failedImages: 0,
    };
  }

  let deletedImages = 0;
  let failedImages = 0;

  for (const message of expiredImageMessages) {
    try {
      await deleteFile(message.imagePublicId, "image");
      deletedImages += 1;
    } catch (error) {
      failedImages += 1;
      console.error("[MessageCleanup] Failed deleting image from cloud storage:", {
        messageId: message._id?.toString?.() || message._id,
        imagePublicId: message.imagePublicId,
        error: error?.message || error,
      });
    }
  }

  const messageIds = expiredImageMessages.map((item) => item._id);
  const deleteResult = await Message.deleteMany({ _id: { $in: messageIds } });

  return {
    scanned: expiredImageMessages.length,
    deletedMessages: deleteResult.deletedCount || 0,
    deletedImages,
    failedImages,
  };
};
