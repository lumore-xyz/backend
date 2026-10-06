import ThisOrThatAnswer from "../models/thisOrThatAnswer.model.js";
import ThisOrThatQuestion from "../models/thisOrThatQuestion.model.js";
import { logError } from "../utils/logError.js";

export const getAnswersByUser = async (userIds) => {
  const answers = await ThisOrThatAnswer.find({ userId: { $in: userIds } })
    .select("userId questionId selection")
    .lean();

  const byUser = new Map();
  for (const answer of answers) {
    const userId = answer.userId.toString();
    if (!byUser.has(userId)) byUser.set(userId, new Map());
    byUser.get(userId).set(answer.questionId.toString(), answer.selection);
  }
  return byUser;
};

export const getReadableAnswersByUser = async ({ userIds, answersByUser }) => {
  const answers = userIds.flatMap((userId) =>
    [...(answersByUser.get(String(userId)) || [])]
      .filter(([, selection]) => selection === "left" || selection === "right")
      .sort(([left], [right]) => String(left).localeCompare(String(right)))
      .slice(0, 10)
      .map(([questionId, selection]) => ({
      userId: String(userId), questionId, selection,
    })),
  );
  if (!answers.length) return new Map();

  let questions;
  try {
    questions = await ThisOrThatQuestion.find({
      _id: { $in: [...new Set(answers.map((answer) => answer.questionId))] },
    }).select("leftOption rightOption").lean();
  } catch (error) {
    // Prompt enrichment is optional; ranking and local notes can still proceed.
    logError("[matchnote] question_load_failed", error);
    return new Map();
  }
  const questionById = new Map(questions.map((question) => [
    String(question._id), question,
  ]));
  const readableByUser = new Map();

  for (const { userId, questionId, selection } of answers) {
    const question = questionById.get(String(questionId));
    if (!question) continue;
    if (!readableByUser.has(userId)) readableByUser.set(userId, []);
    if (readableByUser.get(userId).length < 10) {
      readableByUser.get(userId).push({
        question: `${question.leftOption} or ${question.rightOption}`,
        answer: selection === "left" ? question.leftOption : question.rightOption,
      });
    }
  }

  return readableByUser;
};

export const getThisOrThatStats = ({ seekerAnswers, candidateAnswers }) => {
  let sharedAnswers = 0;
  let matchedAnswers = 0;

  for (const [questionId, selection] of seekerAnswers.entries()) {
    if (!candidateAnswers.has(questionId)) continue;
    sharedAnswers += 1;
    if (candidateAnswers.get(questionId) === selection) matchedAnswers += 1;
  }

  return {
    sharedAnswers,
    matchedAnswers,
    matchRate: sharedAnswers
      ? Math.round((matchedAnswers / sharedAnswers) * 10000) / 100
      : 0,
  };
};
