import mongoose from "mongoose";

const PLATFORMS = ["android", "ios"];

const SEMVER_LIKE = /^\d+(\.\d+){0,3}([-+][0-9A-Za-z.-]+)?$/;

const mobileAppVersionSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      required: true,
      enum: PLATFORMS,
      lowercase: true,
      trim: true,
      index: true,
    },
    latestVersion: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (value) => SEMVER_LIKE.test(String(value || "").trim()),
        message: "latestVersion must be a semantic-style version (e.g. 1.0.1)",
      },
    },
    minimumSupportedVersion: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (value) => SEMVER_LIKE.test(String(value || "").trim()),
        message:
          "minimumSupportedVersion must be a semantic-style version (e.g. 1.0.1)",
      },
    },
    forceUpdate: {
      type: Boolean,
      default: false,
    },
    playStoreUrl: {
      type: String,
      default: "",
      trim: true,
    },
    appStoreUrl: {
      type: String,
      default: "",
      trim: true,
    },
    updateTitle: {
      type: String,
      default: "Update available",
      trim: true,
      maxlength: 120,
    },
    updateMessage: {
      type: String,
      default: "A new version of the app is available. Please update for the best experience.",
      trim: true,
      maxlength: 1000,
    },
    isActive: {
      type: Boolean,
      default: true,
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

mobileAppVersionSchema.index({ platform: 1, isActive: 1 });

export default mongoose.model("MobileAppVersion", mobileAppVersionSchema);
export { PLATFORMS };