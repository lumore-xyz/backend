import mongoose from "mongoose";

const userPreferenceSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  interestedIn: {
    type: String,
    default: "all",
  },
  ageRange: {
    type: [Number],
    default: [18, 27],
    validate: {
      validator: function (v) {
        return Array.isArray(v) && v.length === 2;
      },
      message: "ageRange must contain exactly two numbers (min and max)",
    },
  },
  distance: { type: Number, default: 10 }, // in kilometers
  goal: {
    primary: {
      type: String,
    },
    secondary: {
      type: String,
    },
    tertiary: {
      type: String,
    },
  },
  interests: {
    type: [String],
    default: [],
  },
  relationshipType: {
    type: String,
  },
  preferredLanguages: {
    type: [String],
    default: [],
  },
  zodiacPreference: {
    type: [String],
    default: [],
  },
  personalityTypePreference: {
    type: [String],
  },
  dietPreference: {
    type: [String],
  },
});

export default mongoose.model("UserPreference", userPreferenceSchema);
