// /models/message.model.js
import mongoose from "mongoose";
import { MESSAGE_TYPES } from "../utils/message.js";

const reactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    emoji: {
      type: String,
      default: "\u2764\uFE0F",
      maxlength: 32,
    },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    roomId: {
      type: String,
      default: null,
    },
    messageType: {
      type: String,
      enum: MESSAGE_TYPES,
      default: "text",
    },
    imageUrl: {
      type: String,
      default: null,
    },
    imagePublicId: {
      type: String,
      default: null,
    },
    audioUrl: {
      type: String,
      default: null,
    },
    audioPublicId: {
      type: String,
      default: null,
    },
    audioDurationMs: {
      type: Number,
      default: null,
    },
    audioWaveform: {
      type: [Number],
      default: [],
    },
    reactions: {
      type: [reactionSchema],
      default: [],
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    message: {
      type: String,
      required: function requiredMessage() {
        return this.messageType === "text";
      },
      trim: true,
      default: null,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
    readAt: {
      type: Date,
      default: null,
    },
    timestamp: { type: Date, default: Date.now, expires: "24h" },
  },
  { timestamps: true }
);

messageSchema.index({ roomId: 1, createdAt: 1 });

export default mongoose.model("Message", messageSchema);

