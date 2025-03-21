import mongoose from "mongoose";
import { IPreferences } from "../types/index.js";

const userPreferenceSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
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
  goal: {
    primary: {
      type: String,
      enum: [
        "Serious Relationship",
        "Casual Dating",
        "Marriage",
        "Friendship",
        "Quick Sex",
        "Undecided",
        "Long-Term Dating",
        "Open Relationship",
        "Networking",
        "Exploring Sexuality",
        "Travel Companion",
        "Polyamorous Relationship",
        "Activity Partner",
        "Sugar Dating",
        "Spiritual Connection",
      ],
    },
    secondary: {
      type: String,
      enum: [
        "Serious Relationship",
        "Casual Dating",
        "Marriage",
        "Friendship",
        "Quick Sex",
        "Undecided",
        "Long-Term Dating",
        "Open Relationship",
        "Networking",
        "Exploring Sexuality",
        "Travel Companion",
        "Polyamorous Relationship",
        "Activity Partner",
        "Sugar Dating",
        "Spiritual Connection",
      ],
    },
    tertiary: {
      type: String,
      enum: [
        "Serious Relationship",
        "Casual Dating",
        "Marriage",
        "Friendship",
        "Quick Sex",
        "Undecided",
        "Long-Term Dating",
        "Open Relationship",
        "Networking",
        "Exploring Sexuality",
        "Travel Companion",
        "Polyamorous Relationship",
        "Activity Partner",
        "Sugar Dating",
        "Spiritual Connection",
      ],
    },
  },
});

// 1️⃣ Serious Relationship – Looking for a long-term, committed relationship.
// 2️⃣ Casual Dating – Interested in dating without long-term commitment.
// 3️⃣ Marriage – Seeking a life partner for marriage.
// 4️⃣ Friendship – Looking to build platonic relationships.
// 5️⃣ Quick Sex – Seeking short-term or purely physical relationships.
// 6️⃣ Undecided – Exploring options, not sure what they want.
// 7️⃣ Long-Term Dating – Not ready for marriage but seeking a serious long-term partner.
// 8️⃣ Open Relationship – Interested in ethical non-monogamous relationships.
// 9️⃣ Networking – Looking to connect professionally or socially.
// 🔟 Exploring Sexuality – Figuring out their sexual orientation or preferences.
// 1️⃣1️⃣ Travel Companion – Looking for someone to travel with.
// 1️⃣2️⃣ Polyamorous Relationship – Interested in having multiple partners in a poly relationship.
// 1️⃣3️⃣ Activity Partner – Looking for someone to do hobbies or sports with.
// 1️⃣4️⃣ Sugar Dating – Seeking a mutually beneficial arrangement (sugar daddy/mommy/baby).
// 1️⃣5️⃣ Spiritual Connection – Looking for deep emotional or spiritual bonding.

export default mongoose.model<IPreferences>(
  "UserPreference",
  userPreferenceSchema
);
