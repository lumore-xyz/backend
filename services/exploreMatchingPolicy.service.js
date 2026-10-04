import { compactGoals } from "./matchingPolicy.service.js";
import { jaccard, scoreThisOrThatSimilarity } from "./matchingScore.service.js";
import { normalizeString, normalizeStringArray } from "../utils/strings.js";

const SCORE_WEIGHTS = { distance: 40, goals: 40, interests: 10, thisOrThat: 10 };
const round2 = (value) => Math.round(Number(value) * 100) / 100;

export const scoreExploreCandidate = ({ seeker, candidate, context, distanceKm }) => {
  const { seekerPrefs, candidatePrefs, seekerAnswers, candidateAnswers } = context;
  const seekerGoals = compactGoals(seekerPrefs.goal);
  const candidateGoals = compactGoals(candidatePrefs.goal);
  const primaryGoal = (prefs) => normalizeString(prefs.goal?.primary);
  const seekerPrimaryGoal = primaryGoal(seekerPrefs);
  const primaryAligned = Boolean(
    seekerPrimaryGoal && seekerPrimaryGoal === primaryGoal(candidatePrefs),
  );
  const goalRatio = primaryAligned ? 1 : jaccard(seekerGoals, candidateGoals) * 0.5;
  const seekerRelationshipType = normalizeString(seekerPrefs.relationshipType);
  const candidateRelationshipType = normalizeString(candidatePrefs.relationshipType);
  const relationshipRatio =
    seekerRelationshipType &&
    seekerRelationshipType === candidateRelationshipType
      ? 1
      : 0;
  const distanceRatio = Number.isFinite(distanceKm) && distanceKm >= 0
    ? 1 / (1 + distanceKm / Math.max(1, seekerPrefs.distance))
    : 0;
  const answers = scoreThisOrThatSimilarity(seekerAnswers, candidateAnswers);
  const components = {
    distance: round2(distanceRatio * SCORE_WEIGHTS.distance),
    goals: round2((goalRatio * 0.8 + relationshipRatio * 0.2) * SCORE_WEIGHTS.goals),
    interests: round2(
      jaccard(
        normalizeStringArray(seeker.interests),
        normalizeStringArray(candidate.interests),
      ) * SCORE_WEIGHTS.interests,
    ),
    thisOrThat: round2(
      answers.similarity * answers.confidence * SCORE_WEIGHTS.thisOrThat,
    ),
  };
  return {
    score: round2(Object.values(components).reduce((sum, value) => sum + value, 0)),
    components,
  };
};
