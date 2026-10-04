import {
  getChatFeedbackForUser,
  saveChatFeedback,
} from "../services/chatFeedback.service.js";
import { getPagination } from "../utils/pagination.js";

export const submitChatFeedback = async (req, res) => {
  const userId = req.user._id;
  const { roomId } = req.params;
  const { feedback, rating, reason } = req.body || {};

  const result = await saveChatFeedback({
    userId,
    roomId,
    feedback,
    rating,
    reason,
  });
  if (result.error === "ROOM_NOT_FOUND") {
    return res.status(404).json({ message: "Room not found" });
  }
  if (result.error === "INVALID_ROOM_PARTICIPANTS") {
    return res.status(400).json({ message: "Invalid room participants" });
  }
  return res.status(200).json(result.saved);
};

export const getReceivedFeedbacks = async (req, res) => {
  const userId = req.user._id;

  const hasPagination = req.query.page !== undefined || req.query.limit !== undefined;
  const { page, limit } = getPagination(req.query, {
    defaultLimit: 20,
    maxLimit: 50,
  });
  const { feedbacks, pagination } = await getChatFeedbackForUser({
    userId,
    hasPagination,
    page,
    limit,
  });

  if (!hasPagination) return res.status(200).json(feedbacks);
  return res.status(200).json({ data: feedbacks, pagination });
};
