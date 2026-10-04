import ThisOrThatAnswer from "../models/thisOrThatAnswer.model.js";
import ThisOrThatQuestion from "../models/thisOrThatQuestion.model.js";
import { hasMorePages } from "../utils/pagination.js";
import {
  THIS_OR_THAT_ANSWER_CHOICE,
  THIS_OR_THAT_QUESTION_STATUS,
} from "../utils/thisOrThat.js";

export const submitAnswer = async ({ userId, questionId, selection }) => {
  const question = await ThisOrThatQuestion.findOne({
    _id: questionId,
    status: THIS_OR_THAT_QUESTION_STATUS.APPROVED,
  });
  if (!question) return null;

  const existing = await ThisOrThatAnswer.findOne({ userId, questionId });
  if (!existing) {
    await ThisOrThatAnswer.create({ userId, questionId, selection });
    question.plays += 1;
    if (selection === THIS_OR_THAT_ANSWER_CHOICE.LEFT) {
      question.leftVotes += 1;
    }
    if (selection === THIS_OR_THAT_ANSWER_CHOICE.RIGHT) {
      question.rightVotes += 1;
    }
    await question.save();
  } else if (existing.selection !== selection) {
    if (existing.selection === THIS_OR_THAT_ANSWER_CHOICE.LEFT) {
      question.leftVotes -= 1;
    }
    if (existing.selection === THIS_OR_THAT_ANSWER_CHOICE.RIGHT) {
      question.rightVotes -= 1;
    }
    if (selection === THIS_OR_THAT_ANSWER_CHOICE.LEFT) {
      question.leftVotes += 1;
    }
    if (selection === THIS_OR_THAT_ANSWER_CHOICE.RIGHT) {
      question.rightVotes += 1;
    }
    existing.selection = selection;
    await existing.save();
    await question.save();
  }

  const totalVotes = question.leftVotes + question.rightVotes;
  return {
    questionId: question._id,
    leftVotes: question.leftVotes,
    rightVotes: question.rightVotes,
    leftPercent: totalVotes
      ? Math.round((question.leftVotes / totalVotes) * 100)
      : 0,
    rightPercent: totalVotes
      ? Math.round((question.rightVotes / totalVotes) * 100)
      : 0,
  };
};

export const getUserAnswers = async ({ userId, page, limit }) => {
  const skip = (page - 1) * limit;
  const [answers, total] = await Promise.all([
    ThisOrThatAnswer.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: "questionId",
        select: "leftOption leftImageUrl rightOption rightImageUrl category status",
      })
      .lean(),
    ThisOrThatAnswer.countDocuments({ userId }),
  ]);

  const data = answers
    .filter(({ questionId }) => questionId)
    .map((answer) => {
      const question = answer.questionId;
      const isLeft = answer.selection === THIS_OR_THAT_ANSWER_CHOICE.LEFT;

      return {
        _id: answer._id,
        questionId: question._id,
        selection: answer.selection,
        selectedText: isLeft ? question.leftOption : question.rightOption,
        selectedImageUrl: isLeft ? question.leftImageUrl : question.rightImageUrl,
        answeredAt: answer.createdAt,
        question: {
          leftOption: question.leftOption,
          leftImageUrl: question.leftImageUrl,
          rightOption: question.rightOption,
          rightImageUrl: question.rightImageUrl,
          category: question.category,
        },
      };
    });
  const hasMore = hasMorePages({ page, limit, total, itemCount: answers.length });

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      hasMore,
      nextPage: hasMore ? page + 1 : null,
    },
  };
};
