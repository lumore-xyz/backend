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
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MatchRoom",
      required: true,
    },
    reason: {
      type: String,
    },
    feedback: {
      type: String,
      maxLength: 5000,
    },
    rating: {
      type: Number,
      min: 1,
      max: 10,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      expires: "30d", // Automatically delete after 30 days
    },
  },
  { timestamps: true }
);

// Compound index to prevent duplicate rejections
rejectedProfileSchema.index({ user: 1, rejectedUser: 1, roomId: 1 });

const RejectedProfile = mongoose.model(
  "RejectedProfile",
  rejectedProfileSchema
);

export default RejectedProfile;
