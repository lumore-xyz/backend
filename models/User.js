// /models/User.js
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },
    nickname: { type: String, trim: true },
    realName: { type: String, trim: true },
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
        validator: (v) => !v || /^\+?[1-9]\d{1,14}$/.test(v),
        message: "Invalid phone number format",
      },
    },
    password: {
      type: String,
      minlength: 8,
      select: true,
    },
    visibleName: { type: String, trim: true },
    hiddenName: { type: String, trim: true },
    gender: {
      type: String,
      enum: ["Male", "Female", "Non-Binary", "Prefer Not to Say"],
    },
    sexualOrientation: {
      type: String,
      enum: [
        "Straight",
        "Gay",
        "Lesbian",
        "Bisexual",
        "Pansexual",
        "Asexual",
        "Queer",
        "Questioning",
        "Prefer Not to Say",
      ],
    },
    height: { type: Number }, // in centimeters
    dob: {
      type: Date,
      validate: {
        validator: function (dob) {
          const minAgeDate = new Date();
          minAgeDate.setFullYear(minAgeDate.getFullYear() - 18);
          return dob <= minAgeDate;
        },
        message: "Must be at least 18 years old",
      },
    },
    bio: { type: String, maxlength: 500 },
    interests: {
      professional: [String],
      hobbies: [String],
    },
    diet: {
      type: String,
      enum: [
        "Vegetarian",
        "Vegan",
        "Pescatarian",
        "Non-Vegetarian",
        "Gluten-Free",
        "Kosher",
        "Halal",
        "No Specific Diet",
      ],
    },
    zodiacSign: {
      type: String,
      enum: [
        "Aries",
        "Taurus",
        "Gemini",
        "Cancer",
        "Leo",
        "Virgo",
        "Libra",
        "Scorpio",
        "Sagittarius",
        "Capricorn",
        "Aquarius",
        "Pisces",
      ],
    },
    lifestyle: {
      alcohol: {
        type: String,
        enum: ["Never", "Rarely", "Socially", "Regular", "Prefer Not to Say"],
      },
      smoking: {
        type: String,
        enum: [
          "Never",
          "Occasionally",
          "Regularly",
          "Trying to Quit",
          "Prefer Not to Say",
        ],
      },
      pets: {
        type: String,
        enum: [
          "Have Pets",
          "Love Pets",
          "Allergic to Pets",
          "No Pets",
          "Prefer Not to Say",
        ],
      },
    },
    work: {
      title: { type: String },
      company: { type: String },
    },
    education: {
      degree: {
        type: String,
        enum: [
          "High School",
          "Associate's",
          "Bachelor's",
          "Master's",
          "Doctorate",
          "Professional Degree",
          "Other",
        ],
      },
      institution: String,
      field: String,
    },
    maritalStatus: {
      type: String,
      enum: [
        "Single",
        "Divorced",
        "Separated",
        "Widowed",
        "Married",
        "Prefer Not to Say",
      ],
    },
    religion: {
      type: String,
      enum: [
        "Christianity",
        "Islam",
        "Hinduism",
        "Buddhism",
        "Judaism",
        "Sikhism",
        "Atheism",
        "Agnostic",
        "Spiritual",
        "Other",
        "Prefer Not to Say",
      ],
    },
    currentLocation: { type: String },
    homeTown: { type: String },
    languages: [
      {
        type: String,
      },
    ],
    personalityType: {
      type: String,
      enum: [
        "INTJ",
        "INTP",
        "ENTJ",
        "ENTP",
        "INFJ",
        "INFP",
        "ENFJ",
        "ENFP",
        "ISTJ",
        "ISFJ",
        "ESTJ",
        "ESFJ",
        "ISTP",
        "ISFP",
        "ESTP",
        "ESFP",
        "Not Sure",
      ],
    },
    profilePicture: { type: String }, // URL to the profile picture
    web3Wallet: {
      address: { type: String, unique: true, sparse: true },
      connected: { type: Boolean, default: false },
    },
    isVerified: { type: Boolean, default: false },
    verificationMethod: {
      type: String,
      enum: ["video", "document", "photo"],
      default: "photo",
    },
    verificationStatus: {
      type: String,
      enum: ["pending", "verified", "rejected"],
      default: "pending",
    },
    isActive: { type: Boolean, default: false },
    lastActive: { type: Date, default: Date.now },
    maxSlots: { type: Number, default: 1 },
    location: {
      type: { type: String, default: "Point", enum: ["Point"] },
      coordinates: { type: [Number], index: "2dsphere" },
      formattedAddress: String,
    },
    googleId: { type: String, unique: true, sparse: true },
    googleEmail: String,
    fieldVisibility: {
      type: Map,
      of: {
        type: String,
        enum: ["public", "unlocked", "private"],
        default: "public",
      },
      default: {
        nickname: "public",
        realName: "public",
        age: "public",
        gender: "public",
        sexualOrientation: "public",
        height: "public",
        bio: "public",
        interests: "public",
        diet: "public",
        zodiacSign: "public",
        lifestyle: "public",
        work: "public",
        education: "public",
        maritalStatus: "public",
        religion: "public",
        currentLocation: "public",
        homeTown: "public",
        languages: "public",
        personalityType: "public",
        profilePicture: "public",
      },
    },
    dailyConversations: {
      type: Number,
      default: 0,
      max: 10,
    },
    lastConversationReset: {
      type: Date,
      default: Date.now,
    },
    activeMatch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    savedChats: [
      {
        match: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        messages: [
          {
            sender: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "User",
            },
            content: String,
            timestamp: {
              type: Date,
              default: Date.now,
            },
          },
        ],
      },
    ],
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
userSchema.methods.updateFieldVisibility = function (field, visibility) {
  if (!this.fieldVisibility) {
    this.fieldVisibility = new Map();
  }
  this.fieldVisibility.set(field, visibility);
  return this.save();
};

// Add a method to check field visibility
userSchema.methods.isFieldVisible = function (field, isUnlocked = false) {
  const visibility = this.fieldVisibility.get(field) || "public";

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
