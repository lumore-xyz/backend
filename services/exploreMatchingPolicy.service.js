import { jaccard, scoreThisOrThatSimilarity } from "./matchingScore.service.js";
import { normalizeString, normalizeStringArray } from "../utils/strings.js";

const SCORE_WEIGHTS = { distance: 20, goals: 20, preferences: 20, profileSimilarity: 20, thisOrThat: 20 };
const ANY_VALUES = new Set(["any", "all", "everyone"]);
const PREFERENCE_FIELDS = [
  ["religionPreference", "religion"],
  ["dietPreference", "diet"],
  ["zodiacPreference", "zodiacSign"],
  ["personalityTypePreference", "personalityType"],
  ["drinkingPreference", "lifestyle.drinking"],
  ["smokingPreference", "lifestyle.smoking"],
  ["petPreference", "lifestyle.pets"],
];
const round2 = (value) => Math.round(Number(value) * 100) / 100;

const getValue = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);

const preferenceMatch = (preferences, value) => {
  const wanted = normalizeStringArray(preferences);
  if (!wanted.length) return null;
  if (wanted.some((item) => ANY_VALUES.has(item))) return null;
  const actual = normalizeString(value);
  return actual ? Number(wanted.includes(actual)) : 0;
};

const scorePreferences = ({ seeker, candidate, seekerPrefs, candidatePrefs }) => {
  const heightScore = (range, height) => {
    if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isFinite) ||
      range[0] <= 0 || range[0] > range[1]) return null;
    // The universal fallback range is not an expressed preference.
    if (range[0] <= 120 && range[1] >= 200) return null;
    return Number(Number.isFinite(height) && height >= range[0] && height <= range[1]);
  };
  const directionalScore = (preferences, profile) => {
    const matches = PREFERENCE_FIELDS.map(([preferenceField, profileField]) =>
      preferenceMatch(preferences[preferenceField], getValue(profile, profileField)));
    matches.push(heightScore(preferences.heightRange, profile.height));
    const stated = matches.filter((match) => match !== null);
    return stated.length ? stated.reduce((sum, match) => sum + match, 0) / stated.length : null;
  };
  const seekerFit = directionalScore(seekerPrefs, candidate);
  const candidateFit = directionalScore(candidatePrefs, seeker);
  if (seekerFit === null) return candidateFit ?? 0;
  if (candidateFit === null) return seekerFit;
  // Balance both people's fit; extra preferences on one side cannot drown out the other.
  return Math.sqrt(seekerFit * candidateFit);
};

const scoreGoals = (seekerGoal, candidateGoal) => {
  const priorities = [["primary", 1], ["secondary", 0.5], ["tertiary", 0.25]];
  let best = 0;
  for (const [leftKey, leftWeight] of priorities) {
    const left = normalizeString(seekerGoal?.[leftKey]);
    if (!left) continue;
    for (const [rightKey, rightWeight] of priorities) {
      if (left === normalizeString(candidateGoal?.[rightKey])) {
        best = Math.max(best, Math.sqrt(leftWeight * rightWeight));
      }
    }
  }
  return best;
};

const distanceAffinity = (distanceKm, preferredDistance) => {
  const radius = Number.isFinite(preferredDistance) && preferredDistance > 0 ? preferredDistance : 50;
  return 1 / (1 + distanceKm / Math.max(1, radius));
};

export const scoreExploreCandidate = ({ seeker, candidate, context, distanceKm }) => {
  const { seekerPrefs, candidatePrefs, seekerAnswers, candidateAnswers } = context;
  const goalRatio = scoreGoals(seekerPrefs.goal, candidatePrefs.goal);
  const seekerRelationshipType = normalizeString(seekerPrefs.relationshipType);
  const candidateRelationshipType = normalizeString(candidatePrefs.relationshipType);
  const relationshipRatio =
    seekerRelationshipType &&
    seekerRelationshipType === candidateRelationshipType
      ? 1
      : 0;
  const distanceRatio = Number.isFinite(distanceKm) && distanceKm >= 0
    ? Math.sqrt(distanceAffinity(distanceKm, seekerPrefs.distance) * distanceAffinity(distanceKm, candidatePrefs.distance))
    : 0;
  const answers = scoreThisOrThatSimilarity(seekerAnswers, candidateAnswers);
  const candidateLanguages = new Set(normalizeStringArray(candidate.languages));
  const sharedLanguage = normalizeStringArray(seeker.languages).some((language) => candidateLanguages.has(language));
  const components = {
    distance: round2(distanceRatio * SCORE_WEIGHTS.distance),
    goals: round2((goalRatio * 0.8 + relationshipRatio * 0.2) * SCORE_WEIGHTS.goals),
    preferences: round2(scorePreferences({ seeker, candidate, seekerPrefs, candidatePrefs }) * SCORE_WEIGHTS.preferences),
    interests: round2(jaccard(normalizeStringArray(seeker.interests), normalizeStringArray(candidate.interests)) * SCORE_WEIGHTS.profileSimilarity / 2),
    languages: sharedLanguage ? SCORE_WEIGHTS.profileSimilarity / 2 : 0,
    thisOrThat: round2(
      answers.similarity ** 2 * answers.confidence * SCORE_WEIGHTS.thisOrThat,
    ),
  };
  return {
    score: round2(Object.values(components).reduce((sum, value) => sum + value, 0)),
    components,
    thisOrThat: {
      sharedAnswers: answers.shared,
      matchedAnswers: answers.matched,
      matchRate: answers.shared
        ? round2((answers.matched / answers.shared) * 100)
        : 0,
    },
  };
};
