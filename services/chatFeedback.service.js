import RejectedProfile from "../models/reject.model.js";
import { hasMorePages } from "../utils/pagination.js";
import MatchRoom from "../models/room.model.js";
import { createNotification } from "./notification.service.js";
import { buildFeedbackNotification } from "./notification.templates.js";
import { getOtherParticipantId } from "../utils/matchRoom.js";
import { logError } from "../utils/logError.js";

export const saveChatFeedback = async ({
  userId,
  roomId,
  feedback,
  rating,
  reason,
}) => {
  const room = await MatchRoom.findById(roomId).lean();
  if (!room) return { error: "ROOM_NOT_FOUND" };

  const rejectedUser = getOtherParticipantId(room, userId);
  if (!rejectedUser) return { error: "INVALID_ROOM_PARTICIPANTS" };

  const payload = {
    user: userId,
    rejectedUser,
    roomId,
    feedback: feedback?.trim() || "",
    reason: reason?.trim() || "",
  };
  if (rating !== undefined) payload.rating = rating;

  const saved = await RejectedProfile.findOneAndUpdate(
    { user: userId, rejectedUser, roomId },
    payload,
    { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
  );

  if (payload.feedback) {
    const notification = buildFeedbackNotification({
      userId: rejectedUser,
      actorId: userId,
      roomId: roomId ? roomId.toString() : null,
      rating: payload.rating,
      reason: payload.reason,
    });
    if (notification) {
      createNotification(notification).catch((error) => {
        logError("[feedback] notification_create_failed", error);
      });
    }
  }

  return { saved };
};

export const getChatFeedbackForUser = async ({
  userId,
  hasPagination,
  page,
  limit,
}) => {
  const filter = {
    rejectedUser: userId,
    feedback: { $exists: true, $ne: "" },
  };
  let query = RejectedProfile.find(filter)
    .populate("user", "_id username nickname profilePicture")
    .populate("roomId", "_id createdAt")
    .sort({ createdAt: -1, _id: -1 });
  if (hasPagination) query = query.skip((page - 1) * limit).limit(limit);

  const [feedbacks, total] = await Promise.all([
    query.lean(),
    hasPagination ? RejectedProfile.countDocuments(filter) : Promise.resolve(0),
  ]);

  return {
    feedbacks,
    pagination: hasPagination
      ? {
          page,
          limit,
          total,
          hasMore: hasMorePages({
            page,
            limit,
            total,
            itemCount: feedbacks.length,
          }),
        }
      : null,
  };
};
