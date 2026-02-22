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
      hasEncryptedText: {
        type: Boolean,
        default: false,
      },
      encryptedContent: {
        alg: {
          type: String,
          default: null,
        },
        keyEpoch: {
          type: Number,
          default: null,
        },
        ciphertext: {
          type: String,
          default: null,
        },
        iv: {
          type: String,
          default: null,
        },
        tag: {
          type: String,
          default: null,
        },
        aadHash: {
          type: String,
          default: null,
        },
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
    encryption: {
      enabled: {
        type: Boolean,
        default: false,
      },
      currentKeyEpoch: {
        type: Number,
        min: 1,
        default: 1,
      },
    },
  },
  { timestamps: true }
);

// Index to speed up matching lookups
MatchRoomSchema.index({ participants: 1 });

export default mongoose.model("MatchRoom", MatchRoomSchema);
