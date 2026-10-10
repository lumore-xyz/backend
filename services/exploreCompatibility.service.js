import UserPreference from "../models/preference.model.js";
import User from "../models/user.model.js";
import { idsEqual, isValidObjectId } from "../utils/objectId.js";
import { getAnswersByUser } from "./matchingAnswers.service.js";
import { normalizePreference } from "./matchingPolicy.service.js";
import { scoreExploreCandidate } from "./exploreMatchingPolicy.service.js";
import { distanceBetween } from "./exploreProfile.service.js";
import { loadSeeker, fail } from "./exploreContext.service.js";
import { SELECT } from "./exploreCandidate.service.js";

export const getProfileCompatibility = async ({ userId, profileId, now = new Date() }) => {
  if (!isValidObjectId(profileId) || idsEqual(userId, profileId)) {
    throw fail("Choose another profile", 400, "INVALID_PROFILE");
  }
  const { user: seeker, prefs: seekerPrefs } = await loadSeeker(userId, now);

  const candidate = await User.findById(profileId).select(SELECT).lean();
  if (!candidate || candidate.isArchived) throw fail("This profile is unavailable", 404, "PROFILE_UNAVAILABLE");

  const [candidatePrefsDoc, answers] = await Promise.all([
    UserPreference.findOne({ user: profileId }).lean(),
    getAnswersByUser([userId, profileId]),
  ]);
  const candidatePrefs = normalizePreference(candidatePrefsDoc, { userGender: candidate.gender });
  const result = scoreExploreCandidate({
    seeker,
    candidate,
    distanceKm: distanceBetween(seeker, candidate),
    context: {
      seekerPrefs,
      candidatePrefs,
      seekerAnswers: answers.get(String(userId)) || new Map(),
      candidateAnswers: answers.get(String(profileId)) || new Map(),
    },
  });
  return { score: result.score, components: result.components };
};
