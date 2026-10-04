import { getQuestionsForUser, submitQuestion } from "../services/thisOrThat.service.js";
import { getPagination } from "../utils/pagination.js";

export const getThisOrThatQuestions = async (req, res) => {
  const userId = req.user.id;
  const { limit } = getPagination(req.query, { maxLimit: 50 });
  const questions = await getQuestionsForUser(userId, limit);
  return res.status(200).json({ success: true, data: questions });
};

export const submitThisOrThatQuestion = async (req, res) => {
  const userId = req.user.id;
  const { leftOption, rightOption, category } = req.body || {};
  const leftFile = req.files?.leftImage?.[0];
  const rightFile = req.files?.rightImage?.[0];

  if (!leftOption || !rightOption) {
    return res.status(400).json({
      success: false,
      message: "leftOption and rightOption are required",
    });
  }
  if (!leftFile?.buffer || !rightFile?.buffer) {
    return res.status(400).json({
      success: false,
      message: "leftImage and rightImage are required",
    });
  }

  const left = String(leftOption).trim();
  const right = String(rightOption).trim();

  if (!left || !right || left.toLowerCase() === right.toLowerCase()) {
    return res.status(400).json({
      success: false,
      message: "Options must be non-empty and different",
    });
  }

  const created = await submitQuestion({
    userId,
    leftOption: left,
    rightOption: right,
    category,
    leftImage: leftFile,
    rightImage: rightFile,
  });

  return res.status(201).json({
    success: true,
    message: "Question submitted for review",
    data: created,
  });
};
