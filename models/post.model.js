import { model, Schema, Types } from "mongoose";

// export type PostType = "PROMPT" | "IMAGE" | "TEXT";
// export type PostVisibility = "public" | "unlock" | "private";

const PostSchema = new Schema(
  {
    userId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: ["PROMPT", "IMAGE", "TEXT"],
      required: true,
      index: true,
    },

    content: {
      promptId: {
        type: Types.ObjectId,
        ref: "Prompt",
      },

      promptAnswer: {
        type: String,
        trim: true,
        maxlength: 500,
      },

      imageUrls: [
        {
          type: String,
        },
      ],

      caption: {
        type: String,
        trim: true,
        maxlength: 300,
      },

      text: {
        type: String,
        trim: true,
        maxlength: 500,
      },
    },

    visibility: {
      type: String,
      enum: ["public", "unlock", "private"],
      default: "public",
      index: true,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

export const Post = model("Post", PostSchema);
