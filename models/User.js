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
    gender: { type: String, enum: ["Male", "Female", "Non-Binary"] },
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
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
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
