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

  const expiredMediaMessages = await Message.find({
    timestamp: { $lte: cutoff },
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

  let deletedImages = 0;
  let deletedAudio = 0;
  let failedImages = 0;
  let failedAudio = 0;

  for (const message of expiredMediaMessages) {
    const isAudio = message.messageType === "audio";
    const publicId = isAudio ? message.audioPublicId : message.imagePublicId;
    const resourceType = isAudio ? "video" : "image";
    try {
      await deleteFile(publicId, resourceType);
      if (isAudio) deletedAudio += 1;
      else deletedImages += 1;
    } catch (error) {
      if (isAudio) failedAudio += 1;
      else failedImages += 1;
      console.error("[MessageCleanup] Failed deleting media from cloud storage:", {
        messageId: message._id?.toString?.() || message._id,
        publicId,
        resourceType,
        error: error?.message || error,
      });
    }
  }

  const messageIds = expiredMediaMessages.map((item) => item._id);
  const deleteResult = await Message.deleteMany({ _id: { $in: messageIds } });

  return {
    scanned: expiredMediaMessages.length,
    deletedMessages: deleteResult.deletedCount || 0,
    deletedImages,
    deletedAudio,
    failedImages,
    failedAudio,
  };
};
