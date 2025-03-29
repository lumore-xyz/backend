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
    bloodGroup: {
      type: String,
      enum: [
        "A+",
        "A-",
        "B+",
        "B-",
        "AB+",
        "AB-",
        "O+",
        "O-",
        "Prefer Not to Say",
      ],
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
    password: {
      type: String,
      minlength: 8,
      select: true,
    },
    gender: {
      type: String,
      enum: ["Man", "Woman", "Non-Binary", "Prefer Not to Say"],
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
      drinking: {
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
      addresses: [
        {
          type: String,
          sparse: true, // Allows null values without breaking uniqueness constraint
        },
      ],
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
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        index: "2dsphere",
        default: [0, 0],
      },
      formattedAddress: {
        type: String,
        default: "",
      },
    },
    googleId: { type: String, unique: true, sparse: true },
    googleEmail: String,
    fieldVisibility: {
      type: Object,
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
      validate: {
        validator: function (v) {
          const validValues = ["public", "unlocked", "private"];
          return Object.values(v).every((value) => validValues.includes(value));
        },
        message:
          "Invalid visibility value. Must be one of: public, unlocked, private",
      },
    },
    dailyConversations: {
      type: Number,
      default: 10,
    },
    lastConversationReset: {
      type: Date,
      default: Date.now,
    },
    activeMatch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      sparse: true,
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

// Add this after the schema definition but before the model creation
userSchema.index({ location: "2dsphere" });

export default mongoose.model("User", userSchema);
