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
    email: {
      type: String,
      unique: true,
      sparse: true, // Allows multiple nulls (users without email)
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
      select: false, // Don't return password by default
    },
    hiddenName: { type: String, trim: true },
    visibleName: {
      type: String,
      trim: true,
      default: function () {
        return this.username;
      },
    },
    gender: {
      type: String,
      enum: ["Male", "Female", "Non-Binary"],
    },
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
    sexualOrientation: {
      type: String,
      enum: [
        "Straight",
        "Gay",
        "Lesbian",
        "Bisexual",
        "Pansexual",
        "Asexual",
        "Other",
      ],
    },
    goal: {
      primary: {
        type: String,
        enum: [
          "Serious Relationship",
          "Casual Dating",
          "Marriage",
          "Friendship",
          "Undecided",
        ],
      },
      secondary: {
        type: String,
        enum: [
          "Serious Relationship",
          "Casual Dating",
          "Marriage",
          "Friendship",
          "Undecided",
        ],
      },
      tertiary: {
        type: String,
        enum: [
          "Serious Relationship",
          "Casual Dating",
          "Marriage",
          "Friendship",
          "Undecided",
        ],
      },
    },
    bio: { type: String, maxlength: 500 },
    interests: {
      professional: [String],
      hobbies: [String],
    },
    photos: [
      {
        type: String,
        validate: {
          validator: (v) => /^(http|https):\/\/[^ "]+$/.test(v),
          message: "Invalid photo URL",
        },
      },
    ],
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    lastActive: { type: Date, default: Date.now },
    location: {
      type: { type: String, default: "Point", enum: ["Point"] },
      coordinates: { type: [Number], index: "2dsphere" },
      formattedAddress: String,
    },
    googleId: { type: String, unique: true, sparse: true },
    googleEmail: String,
    preferences: {
      gender: {
        type: String,
        enum: ["Male", "Female", "Non-Binary", "Any"],
        default: "Any",
      },
      ageRange: {
        min: { type: Number, default: 18 },
        max: { type: Number, default: 27 },
      },
      distance: { type: Number, default: 10 }, // in kilometers
    },
    slots: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        savedAt: { type: Date, default: Date.now },
      },
    ],
    maxSlots: { type: Number, default: 1 },
    unlockedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    rejectedProfiles: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
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

// Update Last Active When User is Queried
userSchema.pre(/^find/, async function (next) {
  if (this._conditions._id) {
    await this.model.updateOne(
      { _id: this._conditions._id },
      { $set: { lastActive: Date.now() } }
    );
  }
  next();
});

export default mongoose.model("User", userSchema);
