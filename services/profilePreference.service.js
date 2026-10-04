import UserPreference from "../models/preference.model.js";
import User from "../models/user.model.js";
import {
  inferInterestedInFromGender,
  normalizeInterestedIn,
} from "../utils/userPreferences.js";

const PREFERENCE_FIELDS = [
  "ageRange",
  "distance",
  "goal",
  "interests",
  "relationshipType",
  "languages",
  "zodiacPreference",
  "personalityTypePreference",
  "dietPreference",
  "heightRange",
  "religionPreference",
  "drinkingPreference",
  "smokingPreference",
  "petPreference",
];

export const getPreferencesByUserIds = async (userIds) =>
  new Map(
    (await UserPreference.find({ user: { $in: userIds } }).lean()).map((doc) => [
      String(doc.user),
      doc,
    ]),
  );

export const getUserIdsByPreferenceFilter = async (filter) => {
  const rows = await UserPreference.find(filter).select("user").lean();
  return [...new Set(rows.map((row) => row.user?.toString()).filter(Boolean))];
};

export const updateProfilePreferences = async (userId, input = {}) => {
  const user = await User.findById(userId).select("gender").lean();
  if (!user) return { error: "USER_NOT_FOUND" };

  let preferences = await UserPreference.findOne({ user: userId });
  if (!preferences) preferences = new UserPreference({ user: userId });

  if (input.interestedIn !== undefined) {
    const interestedIn = normalizeInterestedIn(input.interestedIn);
    if (!interestedIn) return { error: "INVALID_INTERESTED_IN" };
    preferences.interestedIn = interestedIn;
  } else if (!normalizeInterestedIn(preferences.interestedIn)) {
    preferences.interestedIn = inferInterestedInFromGender(user.gender);
  }

  for (const field of PREFERENCE_FIELDS) {
    if (Object.hasOwn(input, field)) preferences[field] = input[field];
  }

  await preferences.save();
  return { preferences };
};

export const getProfilePreferences = async (userId) => {
  const user = await User.findById(userId).lean().select("-password");
  if (!user) throw new Error("User does not exist");

  let preferences = await UserPreference.findOne({ user: userId });
  if (!preferences) preferences = new UserPreference({ user: userId });

  const interestedIn =
    normalizeInterestedIn(preferences.interestedIn) ||
    inferInterestedInFromGender(user.gender);
  if (preferences.isNew || preferences.interestedIn !== interestedIn) {
    preferences.interestedIn = interestedIn;
    await preferences.save();
  }

  if (!interestedIn) {
    return { ...preferences.toObject(), interestedIn: null };
  }

  return preferences;
};
