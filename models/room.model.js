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
    source: {
      type: String,
      enum: ["explore", "location_room"],
      default: "explore",
      index: true,
    },
    locationRoom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LocationRoom",
      default: null,
      index: true,
    },
    locationRoomCycle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LocationRoomCycle",
      default: null,
      index: true,
    },
    sourceMetadata: {
      title: {
        type: String,
        default: "",
      },
      subtitle: {
        type: String,
        default: "",
      },
    },

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
        enum: ["text", "image", "audio"],
        default: "text",
      },
      message: {
        type: String,
        default: null,
      },
      previewType: {
        type: String,
        enum: ["text", "image", "audio", "none"],
        default: "none",
      },
      imageUrl: {
        type: String,
        default: null,
      },
      audioUrl: {
        type: String,
        default: null,
      },
      audioDurationMs: {
        type: Number,
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
MatchRoomSchema.index({ source: 1, locationRoom: 1, locationRoomCycle: 1 });

export default mongoose.model("MatchRoom", MatchRoomSchema);
