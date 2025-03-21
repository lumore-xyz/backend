// /models/User.js
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { IUser } from "../types/index.js";
import { ValidationError } from "../errors/customErrors.js";

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
      sparse: true,
      lowercase: true,
      validate: {
        validator: (v: string) =>
          !v || /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(v),
        message: "Invalid email format",
      },
    },
    phoneNumber: {
      type: String,
      unique: true,
      sparse: true,
      validate: {
        validator: (v: string) => !v || /^\+?[1-9]\d{1,14}$/.test(v),
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
    gender: { type: String, enum: ["Male", "Female", "Non-Binary"] },
    dob: {
      type: Date,
      validate: {
        validator: function (dob: Date) {
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
    isVerified: { type: Boolean, default: false },
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
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtuals
userSchema.virtual("age").get(function () {
  if (!this.dob) return 0;
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
  if (!this.isModified("password") || !this.password) {
    return next(new ValidationError("Password is required"));
  }

  try {
    const saltRounds = 12;
    this.password = await bcrypt.hash(this.password, saltRounds);
    next();
  } catch (error: any) {
    next(error as Error);
  }
});

userSchema.pre("save", function (next) {
  if (this.username) {
    this.username = this.username.toLowerCase(); // Store usernames in lowercase
  }
  next();
});

// Password Comparison Method
userSchema.methods.comparePassword = async function (enteredPassword: string) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Update Last Active When User is Queried
userSchema.pre(/^find/, async function (next) {
  const query = this as any;
  if (query._conditions?._id) {
    await mongoose
      .model("User")
      .updateOne(
        { _id: query._conditions._id },
        { $set: { lastActive: Date.now() } }
      );
  }
  next();
});
const User = mongoose.model<IUser>("User", userSchema);

export default User;
