import mongoose from "mongoose";

const mobileRuntimeConfigSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "global",
      trim: true,
      index: true,
    },
    environment: {
      type: String,
      required: true,
      default: () => String(process.env.NODE_ENV || "development").toLowerCase(),
      lowercase: true,
      trim: true,
      index: true,
    },
    config: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    version: {
      type: String,
      default: () => new Date().toISOString(),
      index: true,
    },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

mobileRuntimeConfigSchema.index(
  { key: 1, environment: 1 },
  { unique: true },
);

mobileRuntimeConfigSchema
  .path("config")
  .validate(
    (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value),
    "config payload must be an object",
  );

export default mongoose.model("MobileRuntimeConfig", mobileRuntimeConfigSchema);
