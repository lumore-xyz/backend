import mongoose from "mongoose";
import { MESSAGE_PREVIEW_TYPES, MESSAGE_TYPES } from "../utils/message.js";
import {
  MATCH_ROOM_SOURCES,
  MATCH_ROOM_SOURCE,
  MATCH_ROOM_STATUSES,
  MATCH_ROOM_STATUS,
} from "../utils/matchRoom.js";

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
      enum: MATCH_ROOM_SOURCES,
      default: MATCH_ROOM_SOURCE.EXPLORE,
    },
    directExplorePairKey: { type: String, select: false },
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
      enum: MATCH_ROOM_STATUSES,
      default: MATCH_ROOM_STATUS.ACTIVE,
    },
    archivedAt: {
      type: Date,
      default: null,
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
        enum: MESSAGE_TYPES,
        default: "text",
      },
      message: {
        type: String,
        default: null,
      },
      previewType: {
        type: String,
        enum: MESSAGE_PREVIEW_TYPES,
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
MatchRoomSchema.index({ directExplorePairKey: 1 }, { unique: true, sparse: true });
MatchRoomSchema.index({ status: 1, archivedAt: 1, updatedAt: 1 });
MatchRoomSchema.index({ source: 1, locationRoom: 1, locationRoomCycle: 1 });

export default mongoose.model("MatchRoom", MatchRoomSchema);
