import mongoose from "mongoose";
import {
  EXPLORE_DAILY_STATUSES,
  EXPLORE_DAILY_STATUS,
  EXPLORE_NOTE_STATUSES,
} from "../utils/exploreDaily.js";

const exploreProfileSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  score: { type: Number, required: true },
  distanceKm: { type: Number, default: null },
  components: mongoose.Schema.Types.Mixed,
  matchNote: String,
  noteStatus: { type: String, enum: EXPLORE_NOTE_STATUSES },
  noteFingerprint: String,
}, { _id: false });

const pendingRefreshSchema = new mongoose.Schema({
  referenceId: { type: String, required: true },
  candidateCount: { type: Number, required: true },
  profiles: [exploreProfileSchema],
}, { _id: false });

const exploreDailySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    dayKey: { type: String, required: true },
    resetAt: { type: Date, required: true },
    status: {
      type: String,
      enum: EXPLORE_DAILY_STATUSES,
      default: EXPLORE_DAILY_STATUS.GENERATING,
    },
    generationToken: String,
    leaseUntil: Date,
    candidateCount: { type: Number, default: 0 },
    rankingVersion: { type: String, default: "explore-v1" },
    amountPaid: { type: Number, default: 0 },
    balanceAfter: Number,
    profiles: [exploreProfileSchema],
    pendingRefresh: { type: pendingRefreshSchema, default: null },
    lastRefreshReferenceId: String,
  },
  { timestamps: true },
);

exploreDailySchema.index({ user: 1, dayKey: 1 }, { unique: true });
// Keep payment recovery records past reset; they must not expire while unsettled.
export default mongoose.model("ExploreDaily", exploreDailySchema);
