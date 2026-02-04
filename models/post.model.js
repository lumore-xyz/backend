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
      },

      imageUrls: {
        type: String,
      },

      caption: {
        type: String,
      },

      text: {
        type: String,
      },
    },

    visibility: {
      type: String,
      enum: ["public", "unlocked", "private"],
      default: "public",
      index: true,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  },
);

PostSchema.index({ userId: 1, visibility: 1, createdAt: -1 });

export const Post = model("Post", PostSchema);
