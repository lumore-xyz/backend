import mongoose from "mongoose";

const rejectedProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rejectedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reason: {
      type: String,
      enum: ["not_interested", "inappropriate", "spam", "other"],
      required: true,
    },
    feedback: {
      type: String,
      maxLength: 500,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Compound index to prevent duplicate rejections
rejectedProfileSchema.index({ user: 1, rejectedUser: 1 }, { unique: true });

const RejectedProfile = mongoose.model(
  "RejectedProfile",
  rejectedProfileSchema
);

export default RejectedProfile;
