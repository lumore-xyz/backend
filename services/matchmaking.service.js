import UserPreference from "../models/preference.model.js";
import MatchRoom from "../models/room.model.js";
import ThisOrThatAnswer from "../models/thisOrThatAnswer.model.js";
import User from "../models/user.model.js";
import { CREDIT_RULES } from "./credits.service.js";

const POOL_MODE = {
  NORMAL: "NORMAL",
  LOW_POOL: "LOW_POOL",
  SCARCE: "SCARCE",
};

const MAX_DISTANCE_KM = 100;
const REMATCH_PENALTY = 25;
const REMATCH_COOLDOWN_DAYS = 7;
const THIRD_PASS_SCORE_DROP = 10;

const MIN_SCORE_BY_MODE = {
  [POOL_MODE.NORMAL]: 55,
  [POOL_MODE.LOW_POOL]: 45,
  [POOL_MODE.SCARCE]: 10,
};

const SCORE_WEIGHTS = {
  profileCompatibility: 45,
  intentAlignment: 20,
  thisOrThat: 15,
  distance: 10,
  fairness: 10,
  sparsePenaltyMax: 10,
};

const ANY_GENDER_VALUES = new Set(["everyone", "all", "any"]);
const SUPPORTED_GENDERS = new Set(["man", "woman"]);

const DEFAULT_PREFS = {
  interestedIn: null,
  ageRange: [18, 27],
  distance: 10,
  goal: { primary: null, secondary: null, tertiary: null },
  interests: [],
  relationshipType: null,
  languages: [],
  zodiacPreference: [],
  personalityTypePreference: [],
  dietPreference: [],
  heightRange: [150, 200],
  religionPreference: [],
  drinkingPreference: [],
  smokingPreference: [],
  petPreference: [],
};

export const resolvePoolMode = ({ poolSize, waitMs }) => {
  if (poolSize >= 30) return POOL_MODE.NORMAL;
  if (poolSize >= 8) return POOL_MODE.LOW_POOL;
  if (waitMs >= 0) return POOL_MODE.SCARCE;
  return POOL_MODE.SCARCE;
};

export const findBestMatchV2 = async ({ userId, now = new Date() }) => {
  const logStep = () => {};

  const seeker = await User.findById(userId)
    .select(
      "_id gender dob interests languages religion diet lifestyle isMatching credits matchmakingTimestamp location updatedAt",
    )
    .lean();
  if (!seeker) return null;
  if (!hasValidLocation(seeker)) return null;
  if (!isSupportedGender(seeker.gender) || !seeker.dob) return null;

  const seekerPrefDoc = await UserPreference.findOne({ user: userId }).lean();
  const seekerPrefs = normalizePreference(seekerPrefDoc, {
    userGender: seeker.gender,
  });
  if (!seekerPrefs.interestedIn.length) return null;

  const seekerId = seeker._id.toString();
  const waitMs = getWaitMs(seeker.matchmakingTimestamp, now);
  const baseDistanceKm = clampDistanceKm(seekerPrefs.distance);

  const basePool = await getCandidateSet({
    seeker,
    seekerPrefs,
    distanceKm: baseDistanceKm,
  });

  const poolMode = resolvePoolMode({
    poolSize: basePool.selected.length,
    waitMs,
  });
  const minScoreForMode =
    MIN_SCORE_BY_MODE[poolMode] ?? MIN_SCORE_BY_MODE.NORMAL;

  const passConfigs = [
    {
      distanceKm: baseDistanceKm,
      minScore: minScoreForMode,
      fallbackType: "none",
    },
    {
      distanceKm: Math.min(
        MAX_DISTANCE_KM,
        Math.max(baseDistanceKm * 1.5, baseDistanceKm + 5),
      ),
      minScore: minScoreForMode,
      fallbackType: "distance_only",
    },
    {
      distanceKm: Math.min(
        MAX_DISTANCE_KM,
        Math.max(baseDistanceKm * 2.5, baseDistanceKm + 15),
      ),
      minScore: Math.max(0, minScoreForMode - THIRD_PASS_SCORE_DROP),
      fallbackType: "threshold_only",
    },
  ];

  const observability = {
    eligible_pool_count: 0,
    rejected_interest_mismatch: 0,
    rejected_age_mismatch: 0,
    fallback_type_used: "none",
    null_match_reason: null,
  };

  let nullMatchReason = "no_eligible_candidates";

  for (let passIndex = 0; passIndex < passConfigs.length; passIndex += 1) {
    const pass = passConfigs[passIndex];
    const candidateSetResult =
      passIndex === 0
        ? basePool
        : await getCandidateSet({
            seeker,
            seekerPrefs,
            distanceKm: pass.distanceKm,
          });

    observability.rejected_interest_mismatch +=
      candidateSetResult.reasonCounts.interest_mismatch || 0;
    observability.rejected_age_mismatch +=
      candidateSetResult.reasonCounts.age_out_of_range || 0;
    observability.eligible_pool_count = Math.max(
      observability.eligible_pool_count,
      candidateSetResult.selected.length,
    );

    if (!candidateSetResult.selected.length) {
      continue;
    }

    const candidateSet = candidateSetResult.selected;
    const [answersByUser, recentRematchSet] = await Promise.all([
      getAnswersByUser([
        seekerId,
        ...candidateSet.map((c) => c.user._id.toString()),
      ]),
      getRecentRematchSet(seekerId, now),
    ]);

    const scored = candidateSet.map(({ user, prefs }) => {
      const candidateId = user._id.toString();
      const scoredCandidate = scoreCandidate({
        seeker,
        candidate: user,
        context: {
          seekerPrefs,
          candidatePrefs: prefs,
          now,
          maxDistanceKm: pass.distanceKm,
          seekerAnswers: answersByUser.get(seekerId) || new Map(),
          candidateAnswers: answersByUser.get(candidateId) || new Map(),
        },
      });

      return {
        ...scoredCandidate,
        user,
        prefs,
        candidateId,
        isRecentRematch: recentRematchSet.has(candidateId),
        matchmakingTimestamp: user.matchmakingTimestamp || null,
        distance: Number(user.distance || 0),
      };
    });

    let filtered = scored
      .map((item) => ({
        ...item,
        totalScore: Math.max(
          0,
          item.totalScore - (item.isRecentRematch ? REMATCH_PENALTY : 0),
        ),
      }))
      .filter((item) => item.totalScore >= pass.minScore)
      .sort(compareCandidates);

    if (!filtered.length) {
      nullMatchReason = "below_threshold";
      continue;
    }

    const winner = filtered[0];
    const runnerUp = filtered[1] || null;
    observability.fallback_type_used = pass.fallbackType;
    observability.null_match_reason = null;

    const result = {
      uid: winner.candidateId,
      user: winner.user,
      mode: poolMode,
      score: winner.totalScore,
      matchingNote: buildMatchingNote({
        seeker,
        seekerId,
        seekerPrefs,
        answersByUser,
        winner,
        poolMode,
        fallbackType: pass.fallbackType,
        candidatePoolSize: filtered.length,
        runnerUpScore: runnerUp?.totalScore ?? null,
      }),
    };

    logStep("result_computed", {
      matchedUserId: result.uid,
      mode: result.mode,
      score: result.score,
      observability,
    });
    return result;
  }

  observability.null_match_reason = nullMatchReason;
  console.info("[matchmaking-v3]", observability);
  return null;
};

export const getPreferenceBasedAvailableCount = async ({
  userId,
  now = new Date(),
}) => {
  const seeker = await User.findById(userId).select("_id gender").lean();
  if (!seeker) return 0;
  if (!isSupportedGender(seeker.gender)) return 0;

  const pref = await UserPreference.findOne({ user: userId })
    .select("interestedIn ageRange")
    .lean();

  const ageRange = Array.isArray(pref?.ageRange) ? pref.ageRange : [18, 27];
  const minAge = Number(ageRange[0]) || 18;
  const maxAge = Number(ageRange[1]) || 27;

  const normalizedGenderPref = normalizeInterestedIn(pref?.interestedIn, {
    userGender: seeker.gender,
  });
  if (!normalizedGenderPref.length) return 0;

  const allowsAnyGender = normalizedGenderPref.some((item) =>
    ANY_GENDER_VALUES.has(item),
  );

  const pipeline = [
    {
      $match: {
        _id: { $ne: seeker._id },
        isMatching: true,
      },
    },
    {
      $match: {
        dob: { $type: "date" },
        ...(allowsAnyGender ? {} : { gender: { $in: normalizedGenderPref } }),
      },
    },
    {
      $addFields: {
        age: {
          $dateDiff: {
            startDate: "$dob",
            endDate: now,
            unit: "year",
          },
        },
      },
    },
    {
      $match: {
        age: {
          $gte: minAge,
          $lte: maxAge,
        },
      },
    },
    { $count: "count" },
  ];

  const [result] = await User.aggregate(pipeline);
  return Number(result?.count || 0);
};

export const scoreCandidate = ({ seeker, candidate, context }) => {
  const {
    seekerPrefs,
    candidatePrefs,
    now,
    maxDistanceKm,
    seekerAnswers,
    candidateAnswers,
  } = context;

  const profileCompatibilityRatio = scoreMutualProfileCompatibility({
    seeker,
    candidate,
    seekerPrefs,
    candidatePrefs,
  });
  const intentAlignmentRatio = scoreIntentAlignment({
    seekerPrefs,
    candidatePrefs,
  });
  const thisOrThat = scoreThisOrThatSimilarity(seekerAnswers, candidateAnswers);
  const distanceKm = Number(candidate.distance || 0) / 1000;
  const distanceRatio = distanceAffinity(distanceKm, maxDistanceKm);
  const fairnessRatio = getFairnessRatio(candidate.matchmakingTimestamp, now);
  const sparsePenaltyRatio = sparseDataPenalty({ candidate, candidatePrefs });

  const profileScore =
    profileCompatibilityRatio * SCORE_WEIGHTS.profileCompatibility;
  const intentScore = intentAlignmentRatio * SCORE_WEIGHTS.intentAlignment;
  const thisOrThatScore =
    thisOrThat.similarity * thisOrThat.confidence * SCORE_WEIGHTS.thisOrThat;
  const distanceScore = distanceRatio * SCORE_WEIGHTS.distance;
  const fairnessScore = fairnessRatio * SCORE_WEIGHTS.fairness;
  const penaltyScore = sparsePenaltyRatio * SCORE_WEIGHTS.sparsePenaltyMax;

  const totalScore = clampNumber(
    profileScore +
      intentScore +
      thisOrThatScore +
      distanceScore +
      fairnessScore -
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
      fairnessScore,
      penaltyScore,
    },
  };
};

async function getCandidateSet({ seeker, seekerPrefs, distanceKm }) {
  const [lng, lat] = seeker.location.coordinates;
  const queryableGenders = getQueryableInterestedInGenders(
    seekerPrefs.interestedIn,
  );
  const query = {
    isMatching: true,
    credits: { $gte: CREDIT_RULES.CONVERSATION_COST },
    ...(queryableGenders.length ? { gender: { $in: queryableGenders } } : {}),
  };

  const rawCandidates = await User.findNearby(
    lng,
    lat,
    distanceKm * 1000,
    query,
    seeker._id.toString(),
    200,
  );

  if (!rawCandidates.length) {
    return {
      selected: [],
      rawCount: 0,
      reasonCounts: {
        missing_candidate_or_id: 0,
        missing_gender: 0,
        missing_dob: 0,
        interest_mismatch: 0,
        age_out_of_range: 0,
      },
    };
  }

  const candidateIds = rawCandidates.map((candidate) => candidate._id);
  const candidatePrefsDocs = await UserPreference.find({
    user: { $in: candidateIds },
  }).lean();
  const candidatePrefsMap = new Map(
    candidatePrefsDocs.map((doc) => [doc.user.toString(), doc]),
  );

  const reasonCounts = {
    missing_candidate_or_id: 0,
    missing_gender: 0,
    missing_dob: 0,
    interest_mismatch: 0,
    age_out_of_range: 0,
  };

  const selected = [];
  for (const candidate of rawCandidates) {
    const prefs = normalizePreference(
      candidatePrefsMap.get(candidate._id.toString()),
      {
        userGender: candidate.gender,
      },
    );
    const eligibility = getHardEligibilityResult({
      seeker,
      seekerPrefs,
      candidate,
      candidatePrefs: prefs,
    });

    if (!eligibility.ok) {
      if (reasonCounts[eligibility.reason] !== undefined) {
        reasonCounts[eligibility.reason] += 1;
      }
      continue;
    }
    selected.push({ user: candidate, prefs });
  }

  return {
    selected,
    rawCount: rawCandidates.length,
    reasonCounts,
  };
}

function getHardEligibilityResult({
  seeker,
  seekerPrefs,
  candidate,
  candidatePrefs,
}) {
  if (!candidate || !candidate._id) {
    return { ok: false, reason: "missing_candidate_or_id" };
  }
  if (
    !isSupportedGender(candidate.gender) ||
    !isSupportedGender(seeker.gender)
  ) {
    return { ok: false, reason: "missing_gender" };
  }
  if (!candidate.dob || !seeker.dob) {
    return { ok: false, reason: "missing_dob" };
  }

  const seekerInterestOk = isInterestedIn(
    seekerPrefs.interestedIn,
    candidate.gender,
    { userGender: seeker.gender },
  );
  const candidateInterestOk = isInterestedIn(
    candidatePrefs.interestedIn,
    seeker.gender,
    { userGender: candidate.gender },
  );
  if (!seekerInterestOk || !candidateInterestOk) {
    return { ok: false, reason: "interest_mismatch" };
  }

  const seekerAge = getAge(seeker.dob);
  const candidateAge = getAge(candidate.dob);
  if (!isAgeInRange(candidateAge, seekerPrefs.ageRange)) {
    return { ok: false, reason: "age_out_of_range" };
  }
  if (!isAgeInRange(seekerAge, candidatePrefs.ageRange)) {
    return { ok: false, reason: "age_out_of_range" };
  }

  return { ok: true, reason: "ok" };
}

async function getAnswersByUser(userIds) {
  const answers = await ThisOrThatAnswer.find({
    userId: { $in: userIds },
  })
    .select("userId questionId selection updatedAt")
    .lean();

  const byUser = new Map();
  for (const answer of answers) {
    const uid = answer.userId.toString();
    if (!byUser.has(uid)) byUser.set(uid, new Map());
    byUser.get(uid).set(answer.questionId.toString(), answer.selection);
  }
  return byUser;
}

async function getRecentRematchSet(seekerId, now) {
  const since = new Date(
    now.getTime() - REMATCH_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
  );
  const rooms = await MatchRoom.find({
    participants: seekerId,
    updatedAt: { $gte: since },
  })
    .select("participants")
    .lean();

  const recent = new Set();
  for (const room of rooms) {
    for (const participantId of room.participants || []) {
      const id = participantId.toString();
      if (id !== seekerId) recent.add(id);
    }
  }
  return recent;
}

function normalizePreference(prefDoc, { userGender } = {}) {
  const merged = { ...DEFAULT_PREFS, ...(prefDoc || {}) };
  const [minAge, maxAge] = Array.isArray(merged.ageRange)
    ? merged.ageRange
    : [18, 27];

  return {
    ...merged,
    interestedIn: normalizeInterestedIn(merged.interestedIn, { userGender }),
    ageRange: {
      min: Number.isFinite(minAge) ? minAge : 18,
      max: Number.isFinite(maxAge) ? maxAge : 27,
    },
    distance: clampDistanceKm(merged.distance),
    interests: normalizeStringArray(merged.interests),
    languages: normalizeStringArray(merged.languages),
    zodiacPreference: normalizeStringArray(merged.zodiacPreference),
    personalityTypePreference: normalizeStringArray(
      merged.personalityTypePreference,
    ),
    dietPreference: normalizeStringArray(merged.dietPreference),
    religionPreference: normalizeStringArray(merged.religionPreference),
    drinkingPreference: normalizeStringArray(merged.drinkingPreference),
    smokingPreference: normalizeStringArray(merged.smokingPreference),
    petPreference: normalizeStringArray(merged.petPreference),
    goal: {
      primary: merged.goal?.primary || null,
      secondary: merged.goal?.secondary || null,
      tertiary: merged.goal?.tertiary || null,
    },
    relationshipType: merged.relationshipType || null,
  };
}

function normalizeInterestedIn(value, { userGender } = {}) {
  const list = Array.isArray(value) ? value : [value];
  const normalized = list
    .map((item) =>
      String(item || "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);

  if (normalized.some((item) => ANY_GENDER_VALUES.has(item))) return ["any"];

  const genders = normalized.filter((item) => isSupportedGender(item));
  if (genders.length) return Array.from(new Set(genders));

  const inferred = inferInterestedInFromGender(userGender);
  return inferred ? [inferred] : [];
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) =>
      String(item || "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
}

function compactGoals(goal) {
  return [goal?.primary, goal?.secondary, goal?.tertiary]
    .map((item) =>
      String(item || "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
}

function isInterestedIn(interestedIn, gender, { userGender } = {}) {
  const targetGender = String(gender || "")
    .trim()
    .toLowerCase();
  if (!isSupportedGender(targetGender)) return false;

  const normalized = normalizeInterestedIn(interestedIn, { userGender });
  if (!normalized.length) return false;
  if (normalized.includes("any")) return true;
  return normalized.includes(targetGender);
}

function getQueryableInterestedInGenders(interestedIn) {
  const normalized = normalizeInterestedIn(interestedIn);
  if (normalized.some((item) => item === "any")) return [];
  return normalized.filter((item) => isSupportedGender(item));
}

function scoreMutualProfileCompatibility({
  seeker,
  candidate,
  seekerPrefs,
  candidatePrefs,
}) {
  const seekerAge = getAge(seeker.dob);
  const candidateAge = getAge(candidate.dob);
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

function scoreThisOrThatSimilarity(seekerAnswers, candidateAnswers) {
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

function isAgeInRange(age, range) {
  if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max))
    return false;
  if (!Number.isFinite(age)) return false;
  return age >= range.min && age <= range.max;
}

function getAge(dob) {
  if (!dob) return NaN;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return NaN;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

function ageClosenessScore(age, range) {
  if (!Number.isFinite(age) || !range) return 0;
  const mid = (range.min + range.max) / 2;
  const halfRange = Math.max((range.max - range.min) / 2, 1);
  return clampNumber(1 - Math.abs(age - mid) / (halfRange + 1), 0, 1);
}

function jaccard(a = [], b = []) {
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
  const value = String(candidateValue || "")
    .trim()
    .toLowerCase();
  if (!value) return 0;
  return pref.includes(value) ? 1 : 0;
}

function distanceAffinity(distanceKm, maxDistanceKm) {
  if (!Number.isFinite(distanceKm)) return 0;
  const safeMax = Math.max(maxDistanceKm, 1);
  return clampNumber(1 - distanceKm / safeMax, 0, 1);
}

function getFairnessRatio(matchmakingTimestamp, now) {
  if (!matchmakingTimestamp) return 0;
  const waitedMs = getWaitMs(matchmakingTimestamp, now);
  const fairnessWindowMs = 30 * 60 * 1000;
  return clampNumber(waitedMs / fairnessWindowMs, 0, 1);
}

function getWaitMs(matchmakingTimestamp, now) {
  if (!matchmakingTimestamp) return 0;
  const timestamp = new Date(matchmakingTimestamp).getTime();
  if (Number.isNaN(timestamp)) return 0;
  return Math.max(0, now.getTime() - timestamp);
}

function clampDistanceKm(distance) {
  const parsed = Number(distance);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PREFS.distance;
  return Math.min(parsed, MAX_DISTANCE_KM);
}

function hasValidLocation(user) {
  const coords = user?.location?.coordinates;
  if (!Array.isArray(coords) || coords.length !== 2) return false;
  const [lng, lat] = coords;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
  return !(lng === 0 && lat === 0);
}

function compareCandidates(a, b) {
  if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;

  const aTs = a.matchmakingTimestamp
    ? new Date(a.matchmakingTimestamp).getTime()
    : Infinity;
  const bTs = b.matchmakingTimestamp
    ? new Date(b.matchmakingTimestamp).getTime()
    : Infinity;
  if (aTs !== bTs) return aTs - bTs;

  if (a.distance !== b.distance) return a.distance - b.distance;

  return String(a.candidateId).localeCompare(String(b.candidateId));
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildMatchingNote({
  seeker,
  seekerId,
  seekerPrefs,
  answersByUser,
  winner,
  poolMode,
  fallbackType,
  candidatePoolSize,
  runnerUpScore,
}) {
  const profileScore = round2(winner?.componentScores?.profileScore || 0);
  const intentScore = round2(winner?.componentScores?.intentScore || 0);
  const thisOrThatScore = round2(winner?.componentScores?.thisOrThatScore || 0);
  const distanceScore = round2(winner?.componentScores?.distanceScore || 0);
  const fairnessScore = round2(winner?.componentScores?.fairnessScore || 0);
  const penaltyScore = round2(winner?.componentScores?.penaltyScore || 0);
  const totalScore = round2(winner?.totalScore || 0);
  const runnerUpTotalScore = Number.isFinite(runnerUpScore)
    ? round2(runnerUpScore)
    : null;
  const scoreGapVsRunnerUp = Number.isFinite(runnerUpTotalScore)
    ? round2(totalScore - runnerUpTotalScore)
    : null;
  const distanceKm = Number.isFinite(winner?.distance)
    ? round2(Number(winner.distance) / 1000)
    : null;
  const common = getCommonalityBreakdown({
    seeker,
    candidate: winner?.user,
    seekerPrefs,
    candidatePrefs: winner?.prefs,
  });
  const thisOrThat = getThisOrThatStats({
    seekerAnswers: answersByUser?.get(seekerId) || new Map(),
    candidateAnswers: answersByUser?.get(winner?.candidateId) || new Map(),
  });

  const reasons = [];
  if (common.goals.length) reasons.push("shared_goals");
  if (common.interests.length) reasons.push("shared_interests");
  if (common.languages.length) reasons.push("shared_languages");
  if (common.religion) reasons.push("shared_religion");
  if (common.diet) reasons.push("shared_diet");
  if (thisOrThat.matchedAnswers > 0) reasons.push("this_or_that_similarity");
  if (fairnessScore > 0) reasons.push("wait_time_fairness_boost");
  if (fallbackType !== "none") reasons.push("fallback_distance_or_threshold");
  if (!reasons.length) reasons.push("profile_preference_alignment");

  return {
    version: "matchmaking_v3",
    eligibilityVersion: "v3",
    fallbackType,
    poolMode,
    totalScore,
    candidatePoolSize: Number(candidatePoolSize || 0),
    rankingContext: {
      selectedRank: 1,
      runnerUpScore: runnerUpTotalScore,
      scoreGapVsRunnerUp,
    },
    components: {
      profileScore,
      intentScore,
      thisOrThatScore,
      distanceScore,
      fairnessScore,
      penaltyScore,
    },
    isRecentRematch: Boolean(winner?.isRecentRematch),
    distanceKm,
    common,
    thisOrThat,
    reasons,
  };
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

function getCommonalityBreakdown({
  seeker,
  candidate,
  seekerPrefs,
  candidatePrefs,
}) {
  const seekerGoals = compactGoals(seekerPrefs?.goal);
  const candidateGoals = compactGoals(candidatePrefs?.goal);
  const seekerInterests = normalizeStringArray(seeker?.interests || []);
  const candidateInterests = normalizeStringArray(candidate?.interests || []);
  const seekerLanguages = normalizeStringArray(seeker?.languages || []);
  const candidateLanguages = normalizeStringArray(candidate?.languages || []);

  return {
    goals: getIntersection(seekerGoals, candidateGoals),
    interests: getIntersection(seekerInterests, candidateInterests),
    languages: getIntersection(seekerLanguages, candidateLanguages),
    religion: getExactMatchValue(seeker?.religion, candidate?.religion),
    diet: getExactMatchValue(seeker?.diet, candidate?.diet),
    lifestyle: {
      drinking: getExactMatchValue(
        seeker?.lifestyle?.drinking,
        candidate?.lifestyle?.drinking,
      ),
      smoking: getExactMatchValue(
        seeker?.lifestyle?.smoking,
        candidate?.lifestyle?.smoking,
      ),
      pets: getExactMatchValue(
        seeker?.lifestyle?.pets,
        candidate?.lifestyle?.pets,
      ),
    },
  };
}

function getThisOrThatStats({ seekerAnswers, candidateAnswers }) {
  let sharedAnswers = 0;
  let matchedAnswers = 0;

  for (const [questionId, seekerSelection] of seekerAnswers.entries()) {
    if (!candidateAnswers.has(questionId)) continue;
    sharedAnswers += 1;
    if (candidateAnswers.get(questionId) === seekerSelection) {
      matchedAnswers += 1;
    }
  }

  return {
    sharedAnswers,
    matchedAnswers,
    matchRate: sharedAnswers
      ? round2((matchedAnswers / sharedAnswers) * 100)
      : 0,
  };
}

function getIntersection(a = [], b = []) {
  const setB = new Set((b || []).map((item) => String(item)));
  return Array.from(new Set((a || []).map((item) => String(item)))).filter(
    (item) => setB.has(item),
  );
}

function getExactMatchValue(a, b) {
  const left = String(a || "")
    .trim()
    .toLowerCase();
  const right = String(b || "")
    .trim()
    .toLowerCase();
  if (!left || !right) return null;
  return left === right ? left : null;
}

function isSupportedGender(value) {
  return SUPPORTED_GENDERS.has(
    String(value || "")
      .trim()
      .toLowerCase(),
  );
}

function inferInterestedInFromGender(gender) {
  const normalized = String(gender || "")
    .trim()
    .toLowerCase();
  if (normalized === "man") return "woman";
  if (normalized === "woman") return "man";
  return null;
}
