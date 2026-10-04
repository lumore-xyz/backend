import ThisOrThatQuestion from "../models/thisOrThatQuestion.model.js";
import { logError } from "../utils/logError.js";
import { hasMorePages } from "../utils/pagination.js";
import { awardCreditsForThisOrThatApproval } from "./thisOrThatCredits.service.js";
import { notifyGameSubmissionStatusChange } from "./notificationPublisher.service.js";
import { THIS_OR_THAT_QUESTION_STATUS } from "../utils/thisOrThat.js";

export const getPendingQuestions = async ({ page, limit }) => {
  const skip = (page - 1) * limit;
  const filter = { status: THIS_OR_THAT_QUESTION_STATUS.PENDING };
  const [questions, total] = await Promise.all([
    ThisOrThatQuestion.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("submittedBy", "_id username email")
      .lean(),
    ThisOrThatQuestion.countDocuments(filter),
  ]);

  return {
    questions,
    pagination: {
      page,
      limit,
      total,
      hasMore: hasMorePages({
        page,
        limit,
        total,
        itemCount: questions.length,
      }),
    },
  };
};

export const updateQuestionStatus = async ({ questionId, status }) => {
  const question = await ThisOrThatQuestion.findById(questionId);
  if (!question) return null;

  const previousStatus = question.status;
  question.status = status;
  await question.save();

  let creditResult = { granted: false };
  if (
    status === THIS_OR_THAT_QUESTION_STATUS.APPROVED &&
    previousStatus !== THIS_OR_THAT_QUESTION_STATUS.APPROVED &&
    question.submittedBy
  ) {
    creditResult = await awardCreditsForThisOrThatApproval({
      userId: question.submittedBy,
      questionId: question._id,
    });
  }

  if (
    question.submittedBy &&
    previousStatus !== status &&
    (status === THIS_OR_THAT_QUESTION_STATUS.APPROVED ||
      status === THIS_OR_THAT_QUESTION_STATUS.REJECTED)
  ) {
    notifyGameSubmissionStatusChange({
      userId: question.submittedBy,
      status,
      questionId: question._id,
    }).catch((error) => {
      logError("[this-or-that] notification_create_failed", error);
    });
  }

  return { question, creditAwarded: creditResult.granted };
};
