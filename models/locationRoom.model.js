import mongoose from "mongoose";

const MATCH_INTERVAL_MS = 2 * 60 * 1000;
const LOCATION_ROOM_VISIBILITIES = ["public", "private"];

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
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
      index: true,
    },
    visibility: {
      type: String,
      enum: LOCATION_ROOM_VISIBILITIES,
      default: "public",
      index: true,
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
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
        required: true,
      },
      coordinates: {
        type: [Number],
        required: true,
        validate: {
          validator(coords) {
            if (!Array.isArray(coords) || coords.length !== 2) return false;
            const [longitude, latitude] = coords;
            return (
              Number.isFinite(longitude) &&
              Number.isFinite(latitude) &&
              longitude >= -180 &&
              longitude <= 180 &&
              latitude >= -90 &&
              latitude <= 90
            );
          },
          message: "Invalid room coordinates",
        },
      },
      formattedAddress: {
        type: String,
        trim: true,
        default: "",
      },
    },
    nextMatchAt: {
      type: Date,
      required: true,
      index: true,
      default: () => new Date(Date.now() + MATCH_INTERVAL_MS),
    },
    lastCycleAt: {
      type: Date,
      default: null,
    },
    isCycleLocked: {
      type: Boolean,
      default: false,
      index: true,
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

export const LOCATION_ROOM_MATCH_INTERVAL_MS = MATCH_INTERVAL_MS;
export const LOCATION_ROOM_VISIBILITY_OPTIONS = LOCATION_ROOM_VISIBILITIES;

export default mongoose.model("LocationRoom", locationRoomSchema);
