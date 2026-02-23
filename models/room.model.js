import mongoose from "mongoose";

const MatchRoomSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],

    // optional metadata
    status: {
      type: String,
      enum: ["active", "archive"],
      default: "active",
    },

    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
    lastMessage: {
      sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      messageType: {
        type: String,
        enum: ["text", "image"],
        default: "text",
      },
      message: {
        type: String,
        default: null,
      },
      previewType: {
        type: String,
        enum: ["text", "image", "none"],
        default: "none",
      },
      imageUrl: {
        type: String,
        default: null,
      },
      createdAt: {
        type: Date,
        default: null,
      },
    },
    unreadCounts: {
      type: Map,
      of: Number,
      default: {},
    },

    // to track who ended match, if any
    endedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    matchingNote: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true }
);

// Index to speed up matching lookups
MatchRoomSchema.index({ participants: 1 });

export default mongoose.model("MatchRoom", MatchRoomSchema);
