// /models/user.model.js
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

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
      enum: ["not_started", "pending", "approved", "rejected", "failed"],
      default: "not_started",
    },
    verificationSessionId: {
      type: String,
      default: null,
    },
    password: {
      type: String,
      minlength: 8,
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
    matchmakingTimestamp: { type: Date, default: null },
    socketId: { type: String },
    lastActive: { type: Date, default: Date.now },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
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
    dailyConversations: {
      type: Number,
      default: 10,
    },
    credits: {
      type: Number,
      default: 10,
      min: 0,
      index: true,
    },
    lastDailyCreditAt: {
      type: Date,
      default: null,
    },
    lastConversationReset: {
      type: Date,
      default: Date.now,
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
          const validValues = ["public", "unlocked", "private"];
          return Object.values(v).every((value) => validValues.includes(value));
        },
        message:
          "Invalid visibility value. Must be one of: public, unlocked, private",
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ==================== INDEXES ====================

// CRITICAL: 2dsphere index for geospatial queries
userSchema.index({ location: "2dsphere" });

// // Compound index for matchmaking + geospatial
// userSchema.index(
//   {
//     location: "2dsphere",
//     isMatching: 1,
//     isActive: 1,
//     gender: 1,
//   },
//   { name: "matchmaking_geo_index" }
// );

// Additional useful indexes (deduplicated & fixed)
userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ email: 1 }, { sparse: true, unique: true });
userSchema.index({ phoneNumber: 1 }, { sparse: true, unique: true });
userSchema.index({ googleId: 1 }, { sparse: true, unique: true });
userSchema.index({ telegramId: 1 }, { sparse: true, unique: true });
userSchema.index({ lastActive: -1 });
userSchema.index({ matchmakingTimestamp: 1 }, { sparse: true });
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

  const today = new Date();
  const birthDate = new Date(this.dob);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }
  return age;
});

// ==================== PRE-SAVE HOOKS ====================

// Normalize username to lowercase
userSchema.pre("save", function (next) {
  if (this.username) {
    this.username = this.username.toLowerCase();
  }
  next();
});

// Normalize gender to lowercase (for case-insensitive matching)
userSchema.pre("save", function (next) {
  if (this.gender && typeof this.gender === "string") {
    this.gender = this.gender.toLowerCase().trim();
  }
  next();
});

// Validate location coordinates before saving
userSchema.pre("save", function (next) {
  if (this.location && this.location.coordinates) {
    const [lng, lat] = this.location.coordinates;

    // If coordinates are [0, 0], it's likely not set yet
    if (lng === 0 && lat === 0) {
      console.warn(`[User ${this._id}] Location not properly set (0,0)`);
    }

    // Validate ranges
    if (lng < -180 || lng > 180) {
      return next(
        new Error(`Invalid longitude: ${lng}. Must be between -180 and 180`)
      );
    }
    if (lat < -90 || lat > 90) {
      return next(
        new Error(`Invalid latitude: ${lat}. Must be between -90 and 90`)
      );
    }
  }
  next();
});

// Password Hashing (Only if Modified)
// Uncomment if you want password hashing on save
// userSchema.pre("save", async function (next) {
//   if (!this.isModified("password") || !this.password) return next();
//
//   try {
//     const saltRounds = 12;
//     this.password = await bcrypt.hash(this.password, saltRounds);
//     next();
//   } catch (error) {
//     next(error);
//   }
// });

// ==================== INSTANCE METHODS ====================

// Password Comparison Method
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Update last active timestamp
userSchema.methods.updateLastActive = async function () {
  this.lastActive = Date.now();
  return await this.save();
};

// Update user location with validation
userSchema.methods.updateLocation = async function (
  latitude,
  longitude,
  formattedAddress = ""
) {
  // Validate coordinates
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    throw new Error("Latitude and longitude must be numbers");
  }

  if (latitude < -90 || latitude > 90) {
    throw new Error("Latitude must be between -90 and 90");
  }

  if (longitude < -180 || longitude > 180) {
    throw new Error("Longitude must be between -180 and 180");
  }

  // Update location in GeoJSON format
  this.location = {
    type: "Point",
    coordinates: [longitude, latitude], // [lng, lat] - MongoDB format
    formattedAddress: formattedAddress,
  };
  this.lastLocationUpdate = new Date();

  return await this.save();
};

// Get distance to another user (in meters)
userSchema.methods.getDistanceTo = function (otherUser) {
  if (!this.location?.coordinates || !otherUser.location?.coordinates) {
    return null;
  }

  const [lng1, lat1] = this.location.coordinates;
  const [lng2, lat2] = otherUser.location.coordinates;

  // Haversine formula
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c); // Distance in meters
};

// Check if location is set (not default [0,0])
userSchema.methods.hasValidLocation = function () {
  if (!this.location?.coordinates) return false;
  const [lng, lat] = this.location.coordinates;
  return !(lng === 0 && lat === 0);
};

// Update field visibility
userSchema.methods.updateFieldVisibility = async function (field, visibility) {
  if (!this.fieldVisibility) {
    this.fieldVisibility = {};
  }
  this.fieldVisibility[field] = visibility;
  return await this.save();
};

// Reset daily conversations
userSchema.methods.resetDailyConversations = async function () {
  const today = new Date();
  const lastReset = new Date(this.lastConversationReset);

  // Reset if it's a new day
  if (
    today.getDate() !== lastReset.getDate() ||
    today.getMonth() !== lastReset.getMonth() ||
    today.getFullYear() !== lastReset.getFullYear()
  ) {
    this.dailyConversations = 0;
    this.lastConversationReset = today;
    await this.save();
  }
};

// Check field visibility
userSchema.methods.isFieldVisible = function (field, isUnlocked = false) {
  if (!this.fieldVisibility) {
    return true;
  }
  const visibility = this.fieldVisibility[field] || "public";

  switch (visibility) {
    case "public":
      return true;
    case "unlocked":
      return isUnlocked;
    case "private":
      return false;
    default:
      return true;
  }
};

// Modify toJSON to filter fields based on visibility
userSchema.methods.toJSON = function (isUnlocked = false) {
  const obj = this.toObject();
  const visibleObj = {};

  // Process each field based on visibility settings
  Object.keys(obj).forEach((field) => {
    if (field === "fieldVisibility" || field === "_id" || field === "__v") {
      visibleObj[field] = obj[field];
      return;
    }

    if (this.isFieldVisible(field, isUnlocked)) {
      visibleObj[field] = obj[field];
    }
  });

  // Never expose password
  delete visibleObj.password;

  return visibleObj;
};

// ==================== STATIC METHODS ====================

// Find users within distance (returns array with distance field)
userSchema.statics.findNearby = async function (
  longitude,
  latitude,
  maxDistanceMeters = 10000,
  additionalQuery = {},
  userId,
  limit = 100
) {
  return await this.aggregate([
    {
      $geoNear: {
        near: {
          type: "Point",
          coordinates: [longitude, latitude],
        },
        distanceField: "distance",
        maxDistance: maxDistanceMeters,
        spherical: true,
        query: {
          _id: { $ne: new mongoose.Types.ObjectId(userId) }, // exclude self
          "location.coordinates": { $exists: true, $ne: [0, 0] },
          ...additionalQuery,
        },
      },
    },

    // 🧠 FAIRNESS: oldest matchmakingTimestamp first
    {
      $sort: {
        matchmakingTimestamp: 1, // oldest first
        distance: 1, // tie-breaker
      },
    },

    // 🚀 Apply limit to 100 candidates
    { $limit: limit },
  ]);
};

// Find users for matchmaking near a location
userSchema.statics.findMatchmakingCandidates = async function (
  userId,
  userLocation,
  userGenderPreference,
  maxDistanceMeters = 10000
) {
  const [longitude, latitude] = userLocation.coordinates;

  // Build gender filter (case-insensitive)
  const genderFilter = {};
  if (userGenderPreference) {
    if (Array.isArray(userGenderPreference)) {
      genderFilter.gender = {
        $in: userGenderPreference.map((g) => g.toLowerCase()),
      };
    } else {
      genderFilter.gender = userGenderPreference.toLowerCase();
    }
  }

  return await this.aggregate([
    {
      $geoNear: {
        near: {
          type: "Point",
          coordinates: [longitude, latitude],
        },
        distanceField: "distance",
        maxDistance: maxDistanceMeters,
        spherical: true,
        query: {
          isMatching: true,
          isActive: true,
          _id: { $ne: userId },
          "location.coordinates": { $exists: true, $ne: [0, 0] },
          ...genderFilter,
        },
      },
    },
    {
      $limit: 100, // Limit candidates for performance
    },
  ]);
};

// Count users by distance ranges
userSchema.statics.getUserDistributionStats = async function (
  longitude,
  latitude
) {
  return await this.aggregate([
    {
      $geoNear: {
        near: {
          type: "Point",
          coordinates: [longitude, latitude],
        },
        distanceField: "distance",
        spherical: true,
        query: {
          isActive: true,
          "location.coordinates": { $exists: true, $ne: [0, 0] },
        },
      },
    },
    {
      $bucket: {
        groupBy: "$distance",
        boundaries: [0, 1000, 5000, 10000, 50000, 100000],
        default: "100km+",
        output: {
          count: { $sum: 1 },
          users: { $push: "$_id" },
        },
      },
    },
  ]);
};

export default mongoose.model("User", userSchema);
