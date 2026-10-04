// /models/user.model.js
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import {
  VERIFICATION_STATUSES,
  VERIFICATION_STATUS,
} from "../utils/verification.js";
import { getAge } from "../utils/age.js";
import {
  buildCanonicalLocation,
  GEOJSON_POINT_TYPE,
} from "../utils/location.js";
import {
  isProfileFieldVisible,
  PROFILE_VISIBILITY_VALUES,
} from "../utils/profileVisibility.js";

const PRIVATE_USER_FIELDS = new Set([
  "password",
  "passwordResetToken",
  "passwordResetExpiresAt",
  "googleId",
  "telegramId",
  "verificationSessionId",
  "socketId",
  "isArchived",
  "archivedAt",
  "scheduledDeletionAt",
  "lastActive",
  "lastLocationUpdate",
  "lastDailyCreditAt",
  "explorePayment",
  "exploreRefreshPayment",
  "referredBy",
]);

const userSchema = new mongoose.Schema(
  {
    googleId: { type: String },
    telegramId: { type: String },
    profilePicture: { type: String },
    nickname: String,
    realName: String,
    bloodGroup: String,
    username: {
      type: String,
      required: [true, "Username is required"],
      trim: true,
      minlength: 3,
    },
    email: {
      type: String,
      lowercase: true,
      validate: {
        validator: (v) =>
          !v || /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(v),
        message: "Invalid email format",
      },
    },
    phoneNumber: {
      type: String,
      validate: {
        validator: (v) =>
          !v || /^\+?[1-9]\d{1,14}$/.test(v.replace(/\s+/g, "")),
        message: "Invalid phone number format",
      },
    },
    emailVerified: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    verificationMethod: {
      type: String,
      default: null,
    },
    verificationStatus: {
      type: String,
      enum: VERIFICATION_STATUSES,
      default: VERIFICATION_STATUS.NOT_STARTED,
    },
    verificationSessionId: {
      type: String,
      default: null,
    },
    password: {
      type: String,
      minlength: 8,
    },
    passwordResetToken: {
      type: String,
      default: null,
      select: false,
    },
    passwordResetExpiresAt: {
      type: Date,
      default: null,
      select: false,
    },
    gender: {
      type: String,
      lowercase: true, // Automatically convert to lowercase for case-insensitive matching
      trim: true,
    },
    height: Number,
    dob: Date,
    diet: String,
    zodiacSign: String,
    bio: { type: String, maxlength: 500 },
    interests: {
      type: [String],
      validate: {
        validator: function (v) {
          return v.length <= 5;
        },
        message: (props) =>
          `You can only select up to 5 interests, but got ${props.value.length}.`,
      },
    },
    lifestyle: {
      drinking: {
        type: String,
      },
      smoking: {
        type: String,
      },
      pets: {
        type: String,
      },
    },
    work: String,
    institution: String,
    maritalStatus: String,
    religion: String,
    hometown: String,
    languages: [
      {
        type: String,
      },
    ],
    personalityType: String,
    isActive: { type: Boolean, default: false },
    isAdmin: { type: Boolean, default: false, index: true },
    isArchived: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null },
    scheduledDeletionAt: { type: Date, default: null },
    isMatching: { type: Boolean, default: false },
    socketId: { type: String },
    lastActive: { type: Date, default: Date.now },
    location: {
      type: {
        type: String,
        enum: [GEOJSON_POINT_TYPE],
        default: GEOJSON_POINT_TYPE,
        required: true,
      },
      coordinates: {
        type: [Number], // IMPORTANT: [longitude, latitude] - NOT [lat, lng]
        required: true,
        default: [0, 0],
        validate: {
          validator: function (coords) {
            if (!coords || coords.length !== 2) return false;
            const [lng, lat] = coords;
            // Validate longitude: -180 to 180, latitude: -90 to 90
            return lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
          },
          message:
            "Invalid coordinates: longitude must be between -180 and 180, latitude between -90 and 90",
        },
      },
      formattedAddress: {
        type: String,
        default: "",
      },
    },
    lastLocationUpdate: {
      type: Date,
      default: null,
    },
    web3Wallet: [
      {
        type: String,
      },
    ],
    credits: {
      type: Number,
      default: 10,
      min: 0,
      index: true,
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    lastDailyCreditAt: {
      type: Date,
      default: null,
    },
    explorePayment: {
      type: new mongoose.Schema({
        dayKey: { type: String, required: true },
        referenceId: { type: String, required: true },
        balanceAfter: { type: Number, required: true },
        settled: { type: Boolean, default: false },
      }, { _id: false }),
      default: null,
      select: false,
    },
    exploreRefreshPayment: {
      type: new mongoose.Schema({
        dayKey: { type: String, required: true },
        referenceId: { type: String, required: true },
        balanceAfter: { type: Number, required: true },
        settled: { type: Boolean, default: false },
      }, { _id: false }),
      default: null,
      select: false,
    },
    fieldVisibility: {
      type: Object,
      default: {
        nickname: "public",
        realName: "public",
        bloodGroup: "public",
        dob: "public",
        gender: "public",
        height: "public",
        bio: "public",
        interests: "public",
        diet: "public",
        zodiacSign: "public",
        lifestyle: "public",
        work: "public",
        institution: "public",
        maritalStatus: "public",
        religion: "public",
        homeTown: "public",
        languages: "public",
        personalityType: "public",
        profilePicture: "public",
      },
      validate: {
        validator: function (v) {
          return Object.values(v).every((value) =>
            PROFILE_VISIBILITY_VALUES.includes(value),
          );
        },
        message: `Invalid visibility value. Must be one of: ${PROFILE_VISIBILITY_VALUES.join(
          ", ",
        )}`,
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ==================== INDEXES ====================

// CRITICAL: 2dsphere index for geospatial queries
userSchema.index({ location: "2dsphere" });

// Additional useful indexes (deduplicated & fixed)
userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ email: 1 }, { sparse: true, unique: true });
userSchema.index({ phoneNumber: 1 }, { sparse: true, unique: true });
userSchema.index({ googleId: 1 }, { sparse: true, unique: true });
userSchema.index({ telegramId: 1 }, { sparse: true, unique: true });
userSchema.index({ passwordResetToken: 1 }, { sparse: true });
userSchema.index({ lastActive: -1 });
userSchema.index({ gender: 1 });
userSchema.index({ dob: 1 });
userSchema.index({ height: 1 });
userSchema.index({ religion: 1 });
userSchema.index({ zodiacSign: 1 });
userSchema.index({ personalityType: 1 });
userSchema.index({ diet: 1 });
userSchema.index({ "lifestyle.drinking": 1 });
userSchema.index({ "lifestyle.smoking": 1 });
userSchema.index({ "lifestyle.pets": 1 });

// ==================== VIRTUALS ====================

userSchema.virtual("age").get(function () {
  if (!this.dob) return null;
  const age = getAge(this.dob);
  return Number.isFinite(age) ? age : null;
});

userSchema.pre("save", async function () {
  if (this.username) {
    this.username = this.username.toLowerCase();
  }

  if (this.location && this.location.coordinates) {
    const [lng, lat] = this.location.coordinates;

    if (lng < -180 || lng > 180) {
      throw new Error(
        `Invalid longitude: ${lng}. Must be between -180 and 180`,
      );
    }
    if (lat < -90 || lat > 90) {
      throw new Error(`Invalid latitude: ${lat}. Must be between -90 and 90`);
    }
  }

  if (!this.isModified("password") || !this.password) return;

  const saltRounds = 12;
  this.password = await bcrypt.hash(this.password, saltRounds);
});

// ==================== INSTANCE METHODS ====================

// Password Comparison Method
userSchema.methods.comparePassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

// Update last active timestamp
userSchema.methods.updateLastActive = async function () {
  this.lastActive = new Date();
  await this.constructor.updateOne(
    { _id: this._id },
    { $set: { lastActive: this.lastActive } },
  );
  return this;
};

// Update user location with validation
userSchema.methods.updateLocation = async function (
  latitude,
  longitude,
  formattedAddress = "",
) {
  this.location = buildCanonicalLocation({
    latitude,
    longitude,
    formattedAddress,
  });
  this.lastLocationUpdate = new Date();

  return this.save();
};

// Check field visibility
userSchema.methods.isFieldVisible = function (field, isUnlocked = false) {
  return isProfileFieldVisible(this, field, isUnlocked);
};

// Modify toJSON to filter fields based on visibility
userSchema.methods.toJSON = function (options = {}) {
  const isUnlocked = options === true || options?.isUnlocked === true;
  const obj = this.toObject();
  const visibleObj = {};

  // Process each field based on visibility settings
  Object.keys(obj).forEach((field) => {
    if (PRIVATE_USER_FIELDS.has(field)) return;

    if (field === "fieldVisibility" || field === "_id" || field === "__v") {
      visibleObj[field] = obj[field];
      return;
    }

    if (this.isFieldVisible(field, isUnlocked)) {
      visibleObj[field] = obj[field];
    }
  });

  return visibleObj;
};

export default mongoose.model("User", userSchema);
