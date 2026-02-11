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

    // to track who ended match, if any
    endedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

// Index to speed up matching lookups
MatchRoomSchema.index({ participants: 1 });

export default mongoose.model("MatchRoom", MatchRoomSchema);
