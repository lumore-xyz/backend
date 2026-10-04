import mongoose from "mongoose";
import {
  LOCATION_ROOM_POOL_STATUSES,
  LOCATION_ROOM_POOL_STATUS,
} from "../utils/locationRoomPool.js";

const locationRoomPinSchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LocationRoom",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isPinned: {
      type: Boolean,
      default: true,
    },
    inPool: {
      type: Boolean,
      default: true,
    },
    poolStatus: {
      type: String,
      enum: LOCATION_ROOM_POOL_STATUSES,
      default: LOCATION_ROOM_POOL_STATUS.IN_POOL,
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
