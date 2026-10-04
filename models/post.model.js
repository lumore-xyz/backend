import { model, Schema, Types } from "mongoose";
import { POST_TYPES } from "../utils/post.js";
import { PROFILE_VISIBILITY_VALUES } from "../utils/profileVisibility.js";

const PostSchema = new Schema(
  {
    userId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
    },

    type: {
      type: String,
      enum: POST_TYPES,
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
      enum: PROFILE_VISIBILITY_VALUES,
      default: "public",
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  },
);

PostSchema.index({ userId: 1, visibility: 1, createdAt: -1 });

export const Post = model("Post", PostSchema);
