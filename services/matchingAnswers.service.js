import ThisOrThatAnswer from "../models/thisOrThatAnswer.model.js";

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
