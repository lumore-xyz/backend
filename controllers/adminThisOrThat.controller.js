import {
  getPendingQuestions,
  updateQuestionStatus,
} from "../services/adminThisOrThat.service.js";
import { getPagination } from "../utils/pagination.js";
import { THIS_OR_THAT_QUESTION_STATUSES } from "../utils/thisOrThat.js";

export const getPendingThisOrThatQuestions = async (req, res) => {
  const { page, limit } = getPagination(req.query);
  const { questions, pagination } = await getPendingQuestions({ page, limit });

  return res.status(200).json({
    success: true,
    data: questions,
    pagination,
  });
};

export const updateThisOrThatQuestionStatus = async (req, res) => {
  const { questionId } = req.params;
  const { status } = req.body || {};

  if (!THIS_OR_THAT_QUESTION_STATUSES.includes(status)) {
    return res
      .status(400)
      .json({
        success: false,
        message: `status must be ${THIS_OR_THAT_QUESTION_STATUSES.join(", ")}`,
      });
  }

  const result = await updateQuestionStatus({ questionId, status });
  if (!result) {
    return res.status(404).json({ success: false, message: "Question not found" });
  }

  return res.status(200).json({
    success: true,
    message: "Question status updated",
    data: {
      question: result.question,
      creditAwarded: result.creditAwarded,
    },
  });
};
