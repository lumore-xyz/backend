import { getAge } from "../utils/age.js";
import { normalizeStringArray, normalizeString } from "../utils/strings.js";
import { ANY_GENDER_VALUES } from "../utils/userPreferences.js";
import { compactGoals } from "./matchingPolicy.service.js";

const SCORE_WEIGHTS = {
  profileCompatibility: 45,
  intentAlignment: 20,
  thisOrThat: 15,
  distance: 10,
  sparsePenaltyMax: 10,
};

export const scoreCandidate = ({ seeker, candidate, context }) => {
  const {
    seekerPrefs,
    candidatePrefs,
    maxDistanceKm,
    seekerAnswers,
    candidateAnswers,
    now,
  } = context;

  const profileCompatibilityRatio = scoreMutualProfileCompatibility({
    seeker,
    candidate,
    seekerPrefs,
    candidatePrefs,
    now,
  });
  const intentAlignmentRatio = scoreIntentAlignment({
    seekerPrefs,
    candidatePrefs,
  });
  const thisOrThat = scoreThisOrThatSimilarity(seekerAnswers, candidateAnswers);
  const distanceKm = Number(candidate.distance || 0) / 1000;
  const distanceRatio = distanceAffinity(distanceKm, maxDistanceKm);
  const sparsePenaltyRatio = sparseDataPenalty({ candidate, candidatePrefs });

  const profileScore =
    profileCompatibilityRatio * SCORE_WEIGHTS.profileCompatibility;
  const intentScore = intentAlignmentRatio * SCORE_WEIGHTS.intentAlignment;
  const thisOrThatScore =
    thisOrThat.similarity * thisOrThat.confidence * SCORE_WEIGHTS.thisOrThat;
  const distanceScore = distanceRatio * SCORE_WEIGHTS.distance;
  const penaltyScore = sparsePenaltyRatio * SCORE_WEIGHTS.sparsePenaltyMax;

  const totalScore = clampNumber(
    profileScore +
      intentScore +
      thisOrThatScore +
      distanceScore +
      penaltyScore,
    0,
    100,
  );

  return {
    totalScore,
    componentScores: {
      profileScore,
      intentScore,
      thisOrThatScore,
      distanceScore,
      penaltyScore,
    },
  };
};

function scoreMutualProfileCompatibility({
  seeker,
  candidate,
  seekerPrefs,
  candidatePrefs,
  now,
}) {
  const seekerAge = getAge(seeker.dob, now);
  const candidateAge = getAge(candidate.dob, now);
  const seekerToCandidateAge = ageClosenessScore(
    candidateAge,
    seekerPrefs.ageRange,
  );
  const candidateToSeekerAge = ageClosenessScore(
    seekerAge,
    candidatePrefs.ageRange,
  );
  const ageScore = (seekerToCandidateAge + candidateToSeekerAge) / 2;

  const interestsScore = jaccard(
    seeker.interests || [],
    candidate.interests || [],
  );
  const languagesScore = jaccard(
    seeker.languages || [],
    candidate.languages || [],
  );
  const traitsScore =
    (traitsAlignmentScore(seekerPrefs, candidate) +
      traitsAlignmentScore(candidatePrefs, seeker)) /
    2;

  return clampNumber(
    ageScore * 0.3 +
      interestsScore * 0.25 +
      languagesScore * 0.15 +
      traitsScore * 0.3,
    0,
    1,
  );
}

function scoreIntentAlignment({ seekerPrefs, candidatePrefs }) {
  const goalScore = jaccard(
    compactGoals(seekerPrefs.goal),
    compactGoals(candidatePrefs.goal),
  );

  const relationshipScore =
    seekerPrefs.relationshipType && candidatePrefs.relationshipType
      ? seekerPrefs.relationshipType === candidatePrefs.relationshipType
        ? 1
        : 0
      : 0.5;

  return clampNumber(goalScore * 0.7 + relationshipScore * 0.3, 0, 1);
}

export function scoreThisOrThatSimilarity(seekerAnswers, candidateAnswers) {
  if (!seekerAnswers.size || !candidateAnswers.size) {
    return { similarity: 0, confidence: 0, shared: 0, matched: 0 };
  }

  let shared = 0;
  let matched = 0;
  for (const [questionId, seekerSelection] of seekerAnswers.entries()) {
    if (!candidateAnswers.has(questionId)) continue;
    shared += 1;
    if (candidateAnswers.get(questionId) === seekerSelection) matched += 1;
  }

  if (!shared) return { similarity: 0, confidence: 0, shared: 0, matched: 0 };
  return {
    similarity: matched / shared,
    confidence: Math.min(shared / 20, 1),
    shared,
    matched,
  };
}

function sparseDataPenalty({ candidate, candidatePrefs }) {
  const checks = [
    Array.isArray(candidate?.interests) && candidate.interests.length > 0,
    Array.isArray(candidate?.languages) && candidate.languages.length > 0,
    compactGoals(candidatePrefs?.goal).length > 0,
    Boolean(candidate?.religion),
    Boolean(candidate?.diet),
    Boolean(candidate?.personalityType),
  ];
  const missing = checks.filter((hasData) => !hasData).length;
  return missing / checks.length;
}

function traitsAlignmentScore(preferences, profile) {
  const scores = [
    singleTraitScore(preferences.dietPreference, profile.diet),
    singleTraitScore(preferences.zodiacPreference, profile.zodiacSign),
    singleTraitScore(
      preferences.personalityTypePreference,
      profile.personalityType,
    ),
    singleTraitScore(preferences.religionPreference, profile.religion),
    singleTraitScore(
      preferences.drinkingPreference,
      profile.lifestyle?.drinking,
    ),
    singleTraitScore(preferences.smokingPreference, profile.lifestyle?.smoking),
    singleTraitScore(preferences.petPreference, profile.lifestyle?.pets),
  ];
  const sum = scores.reduce((acc, value) => acc + value, 0);
  return scores.length ? sum / scores.length : 0;
}

function ageClosenessScore(age, range) {
  if (!Number.isFinite(age) || !range) return 0;
  const mid = (range.min + range.max) / 2;
  const halfRange = Math.max((range.max - range.min) / 2, 1);
  return clampNumber(1 - Math.abs(age - mid) / (halfRange + 1), 0, 1);
}

export function jaccard(a = [], b = []) {
  const setA = new Set((a || []).map((item) => String(item).toLowerCase()));
  const setB = new Set((b || []).map((item) => String(item).toLowerCase()));
  if (!setA.size && !setB.size) return 0;
  let intersectionCount = 0;
  for (const item of setA) {
    if (setB.has(item)) intersectionCount += 1;
  }
  const unionCount = new Set([...setA, ...setB]).size || 1;
  return intersectionCount / unionCount;
}

function singleTraitScore(preferredValues, candidateValue) {
  const pref = normalizeStringArray(preferredValues);
  if (!pref.length) return 0.5;
  if (pref.some((item) => ANY_GENDER_VALUES.has(item))) return 1;
  const value = normalizeString(candidateValue);
  if (!value) return 0;
  return pref.includes(value) ? 1 : 0;
}

function distanceAffinity(distanceKm, maxDistanceKm) {
  if (!Number.isFinite(distanceKm)) return 0;
  const safeMax = Math.max(maxDistanceKm, 1);
  return clampNumber(1 - distanceKm / safeMax, 0, 1);
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
