import { model, Schema } from "mongoose";

const PromptSchema = new Schema(
  {
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },

    category: {
      type: String,
      index: true,
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // optional future use
    exampleAnswers: [
      {
        type: String,
        maxlength: 150,
      },
    ],
  },
  {
    timestamps: true,
  }
);

export const Prompt = model("Prompt", PromptSchema);
