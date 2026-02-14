import { Types } from "mongoose";
import ThisOrThatAnswer from "../models/thisOrThatAnswer.model.js";
import ThisOrThatQuestion from "../models/thisOrThatQuestion.model.js";
import { awardCreditsForThisOrThatApproval } from "../services/credits.service.js";
import { uploadImage } from "../services/file.service.js";

const DEFAULT_QUESTIONS = [
  {
    leftOption: "Sunrise",
    leftImageUrl: "https://picsum.photos/seed/sunrise/600/400",
    rightOption: "Sunset",
    rightImageUrl: "https://picsum.photos/seed/sunset/600/400",
    category: "lifestyle",
  },
  {
    leftOption: "Coffee",
    leftImageUrl: "https://picsum.photos/seed/coffee/600/400",
    rightOption: "Tea",
    rightImageUrl: "https://picsum.photos/seed/tea/600/400",
    category: "food",
  },
  {
    leftOption: "Beach",
    leftImageUrl: "https://picsum.photos/seed/beach/600/400",
    rightOption: "Mountains",
    rightImageUrl: "https://picsum.photos/seed/mountains/600/400",
    category: "travel",
  },
  {
    leftOption: "Books",
    leftImageUrl: "https://picsum.photos/seed/books/600/400",
    rightOption: "Podcasts",
    rightImageUrl: "https://picsum.photos/seed/podcasts/600/400",
    category: "hobbies",
  },
  {
    leftOption: "Call",
    leftImageUrl: "https://picsum.photos/seed/call/600/400",
    rightOption: "Text",
    rightImageUrl: "https://picsum.photos/seed/text/600/400",
    category: "communication",
  },
  {
    leftOption: "Cats",
    leftImageUrl: "https://picsum.photos/seed/cats/600/400",
    rightOption: "Dogs",
    rightImageUrl: "https://picsum.photos/seed/dogs/600/400",
    category: "pets",
  },
  {
    leftOption: "Early bird",
    leftImageUrl: "https://picsum.photos/seed/earlybird/600/400",
    rightOption: "Night owl",
    rightImageUrl: "https://picsum.photos/seed/nightowl/600/400",
    category: "lifestyle",
  },
  {
    leftOption: "City life",
    leftImageUrl: "https://picsum.photos/seed/city/600/400",
    rightOption: "Small town",
    rightImageUrl: "https://picsum.photos/seed/smalltown/600/400",
    category: "lifestyle",
  },
];

const ensureDefaultQuestions = async () => {
  const total = await ThisOrThatQuestion.countDocuments({ status: "approved" });
  if (total > 0) return;

  await ThisOrThatQuestion.insertMany(
    DEFAULT_QUESTIONS.map((item) => ({ ...item, status: "approved" })),
  );
};

export const getThisOrThatQuestions = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);

    await ensureDefaultQuestions();

    const answered = await ThisOrThatAnswer.find({ userId })
      .select("questionId")
      .lean();

    const answeredIds = answered.map((item) => item.questionId);

    const questions = await ThisOrThatQuestion.aggregate([
      {
        $match: {
          status: "approved",
          _id: { $nin: answeredIds },
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

    return res.status(200).json({
      success: true,
      data: questions,
    });
  } catch (error) {
    console.error("[this-or-that] Failed to fetch questions:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const submitThisOrThatAnswer = async (req, res) => {
  try {
    const userId = req.user.id;
    const { questionId, selection } = req.body;

    if (!Types.ObjectId.isValid(questionId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid questionId" });
    }
    if (!["left", "right"].includes(selection)) {
      return res
        .status(400)
        .json({ success: false, message: "selection must be left or right" });
    }

    const question = await ThisOrThatQuestion.findOne({
      _id: questionId,
      status: "approved",
    });
    if (!question) {
      return res
        .status(404)
        .json({ success: false, message: "Question not found" });
    }

    const existing = await ThisOrThatAnswer.findOne({ userId, questionId });

    if (!existing) {
      await ThisOrThatAnswer.create({ userId, questionId, selection });
      question.plays += 1;
      if (selection === "left") question.leftVotes += 1;
      if (selection === "right") question.rightVotes += 1;
      await question.save();
    } else if (existing.selection !== selection) {
      if (existing.selection === "left") question.leftVotes -= 1;
      if (existing.selection === "right") question.rightVotes -= 1;
      if (selection === "left") question.leftVotes += 1;
      if (selection === "right") question.rightVotes += 1;
      existing.selection = selection;
      await existing.save();
      await question.save();
    }

    const totalVotes = question.leftVotes + question.rightVotes;
    const leftPercent = totalVotes
      ? Math.round((question.leftVotes / totalVotes) * 100)
      : 0;
    const rightPercent = totalVotes
      ? Math.round((question.rightVotes / totalVotes) * 100)
      : 0;

    return res.status(200).json({
      success: true,
      data: {
        questionId: question._id,
        leftVotes: question.leftVotes,
        rightVotes: question.rightVotes,
        leftPercent,
        rightPercent,
      },
    });
  } catch (error) {
    console.error("[this-or-that] Failed to submit answer:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const submitThisOrThatQuestion = async (req, res) => {
  try {
    const userId = req.user.id;
    const { leftOption, rightOption, category } = req.body;
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

    const [leftUpload, rightUpload] = await Promise.all([
      uploadImage({
        buffer: leftFile.buffer,
        folder: "this_or_that",
        format: "webp",
        maxWidth: 900,
        maxHeight: 900,
        optimize: true,
      }),
      uploadImage({
        buffer: rightFile.buffer,
        folder: "this_or_that",
        format: "webp",
        maxWidth: 900,
        maxHeight: 900,
        optimize: true,
      }),
    ]);

    const created = await ThisOrThatQuestion.create({
      leftOption: left,
      leftImageUrl: leftUpload.secure_url,
      rightOption: right,
      rightImageUrl: rightUpload.secure_url,
      category: category ? String(category).trim() : "general",
      submittedBy: userId,
      status: "pending",
    });

    return res.status(201).json({
      success: true,
      message: "Question submitted for review",
      data: created,
    });
  } catch (error) {
    console.error("[this-or-that] Failed to submit question:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getUserThisOrThatAnswers = async (req, res) => {
  try {
    const { userId } = req.params;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 20);
    const skip = (page - 1) * limit;

    const [answers, total] = await Promise.all([
      ThisOrThatAnswer.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({
          path: "questionId",
          select:
            "leftOption leftImageUrl rightOption rightImageUrl category status",
        })
        .lean(),
      ThisOrThatAnswer.countDocuments({ userId }),
    ]);

    const data = answers
      .filter((item) => item.questionId)
      .map((item) => {
        const question = item.questionId;
        const selectedText =
          item.selection === "left" ? question.leftOption : question.rightOption;
        const selectedImageUrl =
          item.selection === "left"
            ? question.leftImageUrl
            : question.rightImageUrl;

        return {
          _id: item._id,
          questionId: question._id,
          selection: item.selection,
          selectedText,
          selectedImageUrl,
          answeredAt: item.createdAt,
          question: {
            leftOption: question.leftOption,
            leftImageUrl: question.leftImageUrl,
            rightOption: question.rightOption,
            rightImageUrl: question.rightImageUrl,
            category: question.category,
          },
        };
      });

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        hasMore: skip + answers.length < total,
        nextPage: skip + answers.length < total ? page + 1 : null,
      },
    });
  } catch (error) {
    console.error("[this-or-that] Failed to fetch user answers:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updateThisOrThatQuestionStatus = async (req, res) => {
  try {
    const { questionId } = req.params;
    const { status } = req.body;

    if (!Types.ObjectId.isValid(questionId)) {
      return res.status(400).json({ success: false, message: "Invalid questionId" });
    }

    if (!["approved", "rejected", "pending"].includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: "status must be approved, rejected or pending" });
    }

    const question = await ThisOrThatQuestion.findById(questionId);
    if (!question) {
      return res.status(404).json({ success: false, message: "Question not found" });
    }

    const previousStatus = question.status;
    question.status = status;
    await question.save();

    let creditResult = { granted: false };
    if (
      status === "approved" &&
      previousStatus !== "approved" &&
      question.submittedBy
    ) {
      creditResult = await awardCreditsForThisOrThatApproval({
        userId: question.submittedBy,
        questionId: question._id,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Question status updated",
      data: {
        question,
        creditAwarded: creditResult.granted,
      },
    });
  } catch (error) {
    console.error("[this-or-that] Failed to update status:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
