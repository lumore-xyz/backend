import mongoose from "mongoose";
import {
  LOCATION_ROOM_STATUSES,
  LOCATION_ROOM_STATUS,
  LOCATION_ROOM_VISIBILITY_VALUES,
  LOCATION_ROOM_VISIBILITY,
  LOCATION_ROOM_TYPE_VALUES,
  LOCATION_ROOM_TYPE,
} from "../utils/locationRoom.js";
import { GEOJSON_POINT_TYPE } from "../utils/location.js";

const MATCH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const locationSchema = new mongoose.Schema({
  type: { type: String, enum: [GEOJSON_POINT_TYPE], default: GEOJSON_POINT_TYPE },
  coordinates: {
    type: [Number],
    required: true,
    validate: {
      validator(coords) {
        if (!Array.isArray(coords) || coords.length !== 2) return false;
        const [longitude, latitude] = coords;
        return Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90;
      },
      message: "Invalid room coordinates",
    },
  },
  formattedAddress: { type: String, trim: true, default: "" },
}, { _id: false });

const locationRoomSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 80,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    tags: {
      type: [{ type: String, trim: true, lowercase: true, maxlength: 24 }],
      default: [],
      validate: { validator: (tags) => tags.length <= 5, message: "A community can have at most 5 tags" },
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: LOCATION_ROOM_STATUSES,
      default: LOCATION_ROOM_STATUS.ACTIVE,
    },
    visibility: {
      type: String,
      enum: LOCATION_ROOM_VISIBILITY_VALUES,
      default: LOCATION_ROOM_VISIBILITY.PUBLIC,
    },
    type: {
      type: String,
      enum: LOCATION_ROOM_TYPE_VALUES,
      default: LOCATION_ROOM_TYPE.LOCAL,
    },
    imageUrl: {
      type: String,
      trim: true,
      default: "",
    },
    imagePublicId: {
      type: String,
      trim: true,
      default: "",
    },
    location: {
      type: locationSchema,
      required: function () { return this.type === LOCATION_ROOM_TYPE.LOCAL; },
      default: undefined,
    },
    nextMatchAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + MATCH_INTERVAL_MS),
    },
    lastCycleAt: {
      type: Date,
      default: null,
    },
    isCycleLocked: {
      type: Boolean,
      default: false,
    },
    cycleLockedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

locationRoomSchema.index({ location: "2dsphere" });
locationRoomSchema.index({ status: 1, nextMatchAt: 1, isCycleLocked: 1 });
locationRoomSchema.index({ status: 1, visibility: 1, nextMatchAt: 1 });
locationRoomSchema.index({ status: 1, visibility: 1, tags: 1 });
locationRoomSchema.index({ status: 1, visibility: 1, createdAt: -1 });

export const LOCATION_ROOM_MATCH_INTERVAL_MS = MATCH_INTERVAL_MS;

export default mongoose.model("LocationRoom", locationRoomSchema);
