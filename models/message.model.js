// /models/message.model.js
import mongoose from "mongoose";

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
      enum: ["text", "image"],
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
    reactions: {
      type: [reactionSchema],
      default: [],
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
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
    message: {
      type: String,
      required: function requiredMessage() {
        return (
          this.messageType === "text" &&
          !this.encryptedContent?.ciphertext &&
          !this.encryptedContent?.alg
        );
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

