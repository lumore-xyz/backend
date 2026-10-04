import ThisOrThatAnswer from "../models/thisOrThatAnswer.model.js";
import ThisOrThatQuestion from "../models/thisOrThatQuestion.model.js";
import { logError } from "../utils/logError.js";
import { THIS_OR_THAT_QUESTION_STATUS } from "../utils/thisOrThat.js";
import { deleteFile, uploadImage } from "./file.service.js";

const cleanupQuestionImages = async (images, context) => {
  const results = await Promise.allSettled(
    images
      .filter((image) => image?.public_id)
      .map((image) => deleteFile(image.public_id)),
  );
  for (const result of results) {
    if (result.status === "rejected") logError(context, result.reason);
  }
};

const DEFAULT_QUESTIONS = [
  ["Sunrise", "Sunset", "lifestyle"],
  ["Coffee", "Tea", "food"],
  ["Beach", "Mountains", "travel"],
  ["Books", "Podcasts", "hobbies"],
  ["Call", "Text", "communication"],
  ["Cats", "Dogs", "pets"],
  ["Early bird", "Night owl", "lifestyle"],
  ["City life", "Small town", "lifestyle", "city", "smalltown"],
].map(([leftOption, rightOption, category, leftSlug, rightSlug]) => ({
  leftOption,
  leftImageUrl: `https://picsum.photos/seed/${leftSlug || leftOption.toLowerCase().replaceAll(" ", "")}/600/400`,
  rightOption,
  rightImageUrl: `https://picsum.photos/seed/${rightSlug || rightOption.toLowerCase().replaceAll(" ", "")}/600/400`,
  category,
  status: THIS_OR_THAT_QUESTION_STATUS.APPROVED,
}));

const ensureDefaultQuestions = async () => {
  if (
    await ThisOrThatQuestion.exists({
      status: THIS_OR_THAT_QUESTION_STATUS.APPROVED,
    })
  ) {
    return;
  }
  await ThisOrThatQuestion.insertMany(DEFAULT_QUESTIONS);
};

export const getQuestionsForUser = async (userId, limit) => {
  await ensureDefaultQuestions();

  const answered = await ThisOrThatAnswer.find({ userId }).select("questionId").lean();
  return ThisOrThatQuestion.aggregate([
    {
      $match: {
        status: THIS_OR_THAT_QUESTION_STATUS.APPROVED,
        _id: { $nin: answered.map(({ questionId }) => questionId) },
      },
    },
    { $sample: { size: limit } },
    {
      $project: {
        leftOption: 1,
        leftImageUrl: 1,
        rightOption: 1,
        rightImageUrl: 1,
        category: 1,
        plays: 1,
        leftVotes: 1,
        rightVotes: 1,
      },
    },
  ]);
};

export const submitQuestion = async ({
  userId,
  leftOption,
  rightOption,
  category,
  leftImage,
  rightImage,
}) => {
  const uploadResults = await Promise.allSettled(
    [leftImage, rightImage].map((file) =>
      uploadImage({
        buffer: file.buffer,
        folder: "this_or_that",
        maxWidth: 900,
        maxHeight: 900,
      }),
    ),
  );
  const uploadedImages = uploadResults
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  const failedUpload = uploadResults.find(
    (result) => result.status === "rejected",
  );
  if (failedUpload) {
    await cleanupQuestionImages(
      uploadedImages,
      "Failed to clean up question images after upload failure",
    );
    throw failedUpload.reason;
  }

  const [leftUpload, rightUpload] = uploadedImages;

  try {
    return await ThisOrThatQuestion.create({
      leftOption,
      leftImageUrl: leftUpload.secure_url,
      rightOption,
      rightImageUrl: rightUpload.secure_url,
      category: category ? String(category).trim() : "general",
      submittedBy: userId,
      status: THIS_OR_THAT_QUESTION_STATUS.PENDING,
    });
  } catch (error) {
    await cleanupQuestionImages(
      uploadedImages,
      "Failed to clean up question images after save failure",
    );
    throw error;
  }
};

