import mongoose from "mongoose";

const userPreferenceSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  interestedIn: {
    type: String,
    default: null,
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
  languages: {
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
  heightRange: {
    type: [Number],
    default: [150, 200],
    validate: {
      validator: function (v) {
        return Array.isArray(v) && v.length === 2;
      },
      message: "heightRange must contain exactly two numbers (min and max)",
    },
  },
  religionPreference: {
    type: [String],
    default: [],
  },
  drinkingPreference: {
    type: [String],
    default: [],
  },
  smokingPreference: {
    type: [String],
    default: [],
  },
  petPreference: {
    type: [String],
    default: [],
  },
});

userPreferenceSchema.index({ user: 1 }, { unique: true });

export default mongoose.model("UserPreference", userPreferenceSchema);
