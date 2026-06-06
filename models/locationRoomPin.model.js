import mongoose from "mongoose";

const locationRoomPinSchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LocationRoom",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    isPinned: {
      type: Boolean,
      default: true,
      index: true,
    },
    inPool: {
      type: Boolean,
      default: true,
      index: true,
    },
    poolStatus: {
      type: String,
      enum: [
        "in_pool",
        "matched",
        "left",
        "insufficient_credits",
        "ineligible",
      ],
      default: "in_pool",
      index: true,
    },
    pinnedAt: {
      type: Date,
      default: Date.now,
    },
    joinedPoolAt: {
      type: Date,
      default: Date.now,
    },
    lastMatchedAt: {
      type: Date,
      default: null,
    },
    lastMatchedCycle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LocationRoomCycle",
      default: null,
    },
    lastMatchRoom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MatchRoom",
      default: null,
    },
    lastPoolError: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true },
);

locationRoomPinSchema.index({ room: 1, user: 1 }, { unique: true });
locationRoomPinSchema.index({ room: 1, isPinned: 1, inPool: 1, joinedPoolAt: 1 });
locationRoomPinSchema.index({ user: 1, isPinned: 1, updatedAt: -1 });

export default mongoose.model("LocationRoomPin", locationRoomPinSchema);
