import { Schema, Types, model } from "mongoose";

const thisOrThatQuestionSchema = new Schema(
  {
    leftOption: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    leftImageUrl: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    rightOption: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    rightImageUrl: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    category: {
      type: String,
      trim: true,
      maxlength: 60,
      default: "general",
    },
    status: {
      type: String,
      enum: ["approved", "pending", "rejected"],
      default: "approved",
      index: true,
    },
    submittedBy: {
      type: Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    plays: {
      type: Number,
      default: 0,
    },
    leftVotes: {
      type: Number,
      default: 0,
    },
    rightVotes: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

thisOrThatQuestionSchema.index({ status: 1, createdAt: -1 });

const ThisOrThatQuestion = model(
  "ThisOrThatQuestion",
  thisOrThatQuestionSchema,
);

export default ThisOrThatQuestion;
