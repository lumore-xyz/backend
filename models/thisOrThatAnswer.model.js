import { Schema, Types, model } from "mongoose";

const thisOrThatAnswerSchema = new Schema(
  {
    userId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    questionId: {
      type: Types.ObjectId,
      ref: "ThisOrThatQuestion",
      required: true,
      index: true,
    },
    selection: {
      type: String,
      enum: ["left", "right"],
      required: true,
    },
  },
  { timestamps: true },
);

thisOrThatAnswerSchema.index({ userId: 1, questionId: 1 }, { unique: true });

const ThisOrThatAnswer = model("ThisOrThatAnswer", thisOrThatAnswerSchema);

export default ThisOrThatAnswer;
