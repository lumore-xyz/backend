import CreditLedger from "../models/creditLedger.model.js";
import ExploreDaily from "../models/exploreDaily.model.js";
import UserPreference from "../models/preference.model.js";
import { idsEqual, isValidObjectId } from "../utils/objectId.js";
import { getUtcDateKey } from "../utils/utcDate.js";
import { EXPLORE_DAILY_STATUS } from "../utils/exploreDaily.js";
import { getAnswersByUser } from "./matchingAnswers.service.js";
import { normalizePreference } from "./matchingPolicy.service.js";
import { scoreExploreCandidate } from "./exploreMatchingPolicy.service.js";
import { distanceBetween } from "./exploreProfile.service.js";
import { loadDiscoverableCandidate, loadExploreContext, fail } from "./exploreContext.service.js";

const initializeExploreModels = () =>
  Promise.all([ExploreDaily.init(), CreditLedger.init()]);

export const getProfileCompatibility = async ({ userId, profileId, now = new Date() }) => {
  if (!isValidObjectId(profileId) || idsEqual(userId, profileId)) {
    throw fail("Choose another profile", 400, "INVALID_PROFILE");
  }
  await initializeExploreModels();
  const { user: seeker, prefs: seekerPrefs } = await loadExploreContext({ userId, now });
  const daily = await ExploreDaily.findOne({
    user: userId,
    dayKey: getUtcDateKey(now),
    status: EXPLORE_DAILY_STATUS.READY,
  }).lean();
  if (!daily?.profiles.some((profile) => idsEqual(profile.user, profileId))) {
    throw fail("Choose a profile from today's unlocked suggestions", 403, "PROFILE_NOT_UNLOCKED");
  }

  const candidate = await loadDiscoverableCandidate({
    userId,
    prefs: seekerPrefs,
    profileId,
    now,
  });
  if (!candidate) throw fail("This profile is unavailable", 404, "PROFILE_UNAVAILABLE");

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
