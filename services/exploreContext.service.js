import UserPreference from "../models/preference.model.js";
import User from "../models/user.model.js";
import { getAge } from "../utils/age.js";
import { toObjectId } from "../utils/objectId.js";
import { buildExploreCandidateQuery, getExcludedIds, SELECT } from "./exploreCandidate.service.js";
import { normalizePreference } from "./matchingPolicy.service.js";
import { settleExplorePayment } from "./exploreCredits.service.js";

export const fail = (message, statusCode = 409, code = "EXPLORE_UNAVAILABLE") =>
  Object.assign(new Error(message), { statusCode, code });

export const loadSeeker = async (userId, now) => {
  const [user, prefsDoc] = await Promise.all([
    User.findById(userId).select(`${SELECT} credits`).lean(),
    UserPreference.findOne({ user: userId }).lean(),
  ]);
  if (!user) throw fail("User not found", 404);
  if (user.isArchived) throw fail("Account is archived", 403);
  const prefs = normalizePreference(prefsDoc, { userGender: user.gender });
  const age = getAge(user.dob, now);
  if (
    !Number.isFinite(age) ||
    age < 18 ||
    !["man", "woman"].includes(user.gender) ||
    !prefs.interestedIn.length
  ) {
    throw fail(
      "Complete your adult age, gender and gender preferences to use Explore",
      400,
      "INCOMPLETE_PROFILE",
    );
  }
  prefs.ageRange.min = Math.max(18, Math.ceil(prefs.ageRange.min));
  prefs.ageRange.max = Math.floor(prefs.ageRange.max);
  if (prefs.ageRange.min > prefs.ageRange.max || prefs.ageRange.max > 120) {
    throw fail("Set a valid age preference between 18 and 120", 400, "INVALID_AGE_PREFERENCE");
  }
  return { user, prefs };
};

export const loadExploreContext = async ({ userId, now }) => {
  const context = await loadSeeker(userId, now);
  await settleExplorePayment(userId);
  return context;
};

export const loadDiscoverableCandidate = async ({
  userId,
  prefs,
  profileId,
  now,
  includeMatched = true,
}) => {
  const excludedIds = await getExcludedIds(userId, includeMatched);
  const query = buildExploreCandidateQuery({ userId, prefs, excludedIds, now });
  query._id.$in = [toObjectId(profileId)];
  return User.findOne(query).select(SELECT).lean();
};
