import mongoose from "mongoose";

const locationRoomCycleSchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LocationRoom",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["running", "completed", "failed"],
      default: "running",
      index: true,
    },
    startedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    nextMatchAt: {
      type: Date,
      default: null,
    },
    poolUserCount: {
      type: Number,
      default: 0,
    },
    eligibleUserCount: {
      type: Number,
      default: 0,
    },
    matchedUserCount: {
      type: Number,
      default: 0,
    },
    matchCount: {
      type: Number,
      default: 0,
    },
    matches: {
      type: [
        {
          users: [
            {
              type: mongoose.Schema.Types.ObjectId,
              ref: "User",
            },
          ],
          matchRoom: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "MatchRoom",
            default: null,
          },
          score: {
            type: Number,
            default: 0,
          },
        },
      ],
      default: [],
    },
    skippedUsers: {
      type: [
        {
          user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
          reason: {
            type: String,
            default: "",
          },
        },
      ],
      default: [],
    },
    error: {
      type: String,
      default: "",
    },
  },
  { timestamps: true },
);

locationRoomCycleSchema.index({ room: 1, startedAt: -1 });

export default mongoose.model("LocationRoomCycle", locationRoomCycleSchema);
