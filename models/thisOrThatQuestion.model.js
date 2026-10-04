import { Schema, Types, model } from "mongoose";
import {
  THIS_OR_THAT_QUESTION_STATUSES,
  THIS_OR_THAT_QUESTION_STATUS,
} from "../utils/thisOrThat.js";

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
      enum: THIS_OR_THAT_QUESTION_STATUSES,
      default: THIS_OR_THAT_QUESTION_STATUS.APPROVED,
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
