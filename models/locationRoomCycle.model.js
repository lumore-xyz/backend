import mongoose from "mongoose";
import {
  LOCATION_ROOM_CYCLE_STATUSES,
  LOCATION_ROOM_CYCLE_STATUS,
} from "../utils/locationRoom.js";

const locationRoomCycleSchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LocationRoom",
      required: true,
    },
    status: {
      type: String,
      enum: LOCATION_ROOM_CYCLE_STATUSES,
      default: LOCATION_ROOM_CYCLE_STATUS.RUNNING,
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

export default mongoose.model("LocationRoomCycle", locationRoomCycleSchema);
