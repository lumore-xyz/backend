import { isValidObjectId } from "../utils/objectId.js";
import {
  getUserAnswers,
  submitAnswer,
} from "../services/thisOrThatAnswer.service.js";
import { getPagination } from "../utils/pagination.js";
import { THIS_OR_THAT_ANSWER_CHOICES } from "../utils/thisOrThat.js";

export const submitThisOrThatAnswer = async (req, res) => {
  const userId = req.user.id;
  const { questionId, selection } = req.body || {};

  if (!isValidObjectId(questionId)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid questionId" });
  }
  if (!THIS_OR_THAT_ANSWER_CHOICES.includes(selection)) {
    return res
      .status(400)
      .json({
        success: false,
        message: `selection must be ${THIS_OR_THAT_ANSWER_CHOICES.join(" or ")}`,
      });
  }

  const data = await submitAnswer({ userId, questionId, selection });
  if (!data) {
    return res
      .status(404)
      .json({ success: false, message: "Question not found" });
  }
  return res.status(200).json({ success: true, data });
};

export const getUserThisOrThatAnswers = async (req, res) => {
  const { userId } = req.params;
  const { page, limit } = getPagination(req.query, {
    defaultLimit: 10,
    maxLimit: 20,
  });
  const result = await getUserAnswers({ userId, page, limit });

  return res.status(200).json({ success: true, ...result });
};
