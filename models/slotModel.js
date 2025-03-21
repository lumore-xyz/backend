import mongoose from "mongoose";

const slotSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    match: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    chatHistory: [
      {
        sender: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        content: String,
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    lastInteraction: {
      type: Date,
      default: Date.now,
    },
    notes: String, // For user to add personal notes about the match
    tags: [String], // For categorizing matches (e.g., "Potential", "Friend", "Dating")
    metadata: {
      matchDate: Date,
      lastMessage: String,
      unreadCount: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Index for faster queries
slotSchema.index({ user: 1, isActive: 1 });
slotSchema.index({ user: 1, match: 1 }, { unique: true });

// Virtual for unread messages
slotSchema.virtual("hasUnreadMessages").get(function () {
  return this.metadata.unreadCount > 0;
});

export default mongoose.model("Slot", slotSchema);
