// /models/User.js
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    googleId: { type: String, unique: true, sparse: true },
    profilePicture: { type: String },
    nickname: String,
    realName: String,
    bloodGroup: String,
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 13,
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      validate: {
        validator: (v) =>
          !v || /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(v),
        message: "Invalid email format",
      },
    },
    phoneNumber: {
      type: String,
      unique: true,
      sparse: true,
      validate: {
        validator: (v) =>
          !v || /^\+?[1-9]\d{1,14}$/.test(v.replace(/\s+/g, "")),
        message: "Invalid phone number format",
      },
    },
    emailVerified: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },
    password: {
      type: String,
      minlength: 8,
    },
    gender: String,
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
    isMatching: { type: Boolean, default: false },
    matchmakingTimestamp: { type: Date, sparse: true, default: null },
    socketId: { type: String, unique: true, sparse: true },
    matchedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      sparse: true,
    },
    activeMatchRoom: {
      type: String,
      sparse: true,
      default: null,
    },
    lastActive: { type: Date, default: Date.now },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
      },
      formattedAddress: {
        type: String,
        default: "",
      },
    },
    web3Wallet: [
      {
        type: String,
        sparse: true, // Allows null values without breaking uniqueness constraint
      },
    ],
    dailyConversations: {
      type: Number,
      default: 10,
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

// Virtuals
userSchema.virtual("age").get(function () {
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

// Password Hashing (Only if Modified)
userSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();

  try {
    const saltRounds = 12;
    this.password = await bcrypt.hash(this.password, saltRounds);
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.pre("save", function (next) {
  if (this.username) {
    this.username = this.username.toLowerCase(); // Store usernames in lowercase
  }
  next();
});

// Password Comparison Method
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Add this method before the export
userSchema.methods.updateLastActive = async function () {
  this.lastActive = Date.now();
  return await this.save();
};

// Add a method to update field visibility
userSchema.methods.updateFieldVisibility = async function (field, visibility) {
  if (!this.fieldVisibility) {
    this.fieldVisibility = {}; // Initialize if missing
  }
  this.fieldVisibility[field] = visibility;
  return await this.save();
};

// Add method to reset daily conversations
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

// Add a method to check field visibility
userSchema.methods.isFieldVisible = function (field, isUnlocked = false) {
  if (!this.fieldVisibility) {
    return true; // Default to visible if fieldVisibility is not set
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

  return visibleObj;
};

export default mongoose.model("User", userSchema);
