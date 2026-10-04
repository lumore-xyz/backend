import { deleteFile, extractPublicIdFromUrl } from "./file.service.js";
import { logError } from "../utils/logError.js";
import { mapInBatches } from "../utils/batch.js";

const DELETE_CONCURRENCY = 10;

export const deleteMessageMedia = async (
  messages,
  { deleteMediaFile = deleteFile, logPrefix = "[MessageCleanup]" } = {},
) => {
  const results = await mapInBatches(messages, DELETE_CONCURRENCY, async (message) => {
    const isAudio = message.messageType === "audio";
    const publicId = isAudio
      ? message.audioPublicId || extractPublicIdFromUrl(message.audioUrl)
      : message.imagePublicId || extractPublicIdFromUrl(message.imageUrl);
    if (!publicId) return null;

    const resourceType = isAudio ? "video" : "image";
    try {
      await deleteMediaFile(publicId, resourceType);
      return { isAudio, deleted: true };
    } catch (error) {
      logError(`${logPrefix} Failed deleting media for message ${message._id}`, error);
      return { isAudio, messageId: message._id, failed: true };
    }
  });

  return results.reduce(
    (summary, result) => {
      if (!result) return summary;
      const kind = result.isAudio ? "Audio" : "Images";
      if (result.failed) {
        summary[`failed${kind}`] += 1;
        summary.failedMessageIds.push(result.messageId);
      } else {
        summary[`deleted${kind}`] += 1;
      }
      return summary;
    },
    {
      deletedImages: 0,
      deletedAudio: 0,
      failedImages: 0,
      failedAudio: 0,
      failedMessageIds: [],
    },
  );
};
