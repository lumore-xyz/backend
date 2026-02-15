import crypto from "crypto";
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

const CACHE_TTL_MS = 3 * 60 * 1000;
const MAX_DISTANCE_KM = 100;
const REMATCH_PENALTY = 25;
const NORMAL_MIN_SCORE = 45;
const LOW_POOL_MIN_SCORE = 35;
const REMATCH_COOLDOWN_DAYS = 7;

const SCORE_CAPS_BY_MODE = {
  [POOL_MODE.NORMAL]: { profile: 65, thisOrThat: 35, fairness: 0 },
  [POOL_MODE.LOW_POOL]: { profile: 60, thisOrThat: 30, fairness: 10 },
  [POOL_MODE.SCARCE]: { profile: 50, thisOrThat: 20, fairness: 30 },
};

const DEFAULT_PREFS = {
  interestedIn: "man",
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

const scoreCache = new Map();

export const resolvePoolMode = ({ poolSize, waitMs }) => {
  if (poolSize >= 30) return POOL_MODE.NORMAL;
  if (poolSize >= 8) return POOL_MODE.LOW_POOL;

  // Keep scarce mode sticky while users are waiting.
  if (waitMs >= 0) return POOL_MODE.SCARCE;
  return POOL_MODE.SCARCE;
};

export const findBestMatchV2 = async ({ userId, now = new Date() }) => {
  const logStep = () => {};

  logStep("start");
  const seeker = await User.findById(userId)
    .select(
      "_id gender dob interests languages religion diet lifestyle isMatching credits matchmakingTimestamp location updatedAt",
    )
    .lean();

  if (!seeker) {
    logStep("seeker_not_found");
    return null;
  }
  if (!hasValidLocation(seeker)) {
    logStep("seeker_invalid_location");
    return null;
  }

  const seekerPrefDoc = await UserPreference.findOne({ user: userId }).lean();
  const seekerPrefs = normalizePreference(seekerPrefDoc);
  const seekerId = seeker._id.toString();
  const waitMs = getWaitMs(seeker.matchmakingTimestamp, now);
  const baseDistanceKm = clampDistanceKm(seekerPrefs.distance);
  let usedRelaxedFallback = false;
  logStep("seeker_loaded", { waitMs, baseDistanceKm });

  let baseCandidateSet = await getCandidateSet({
    seeker,
    seekerPrefs,
    distanceKm: baseDistanceKm,
  });
  if (!baseCandidateSet.length) {
    baseCandidateSet = await getCandidateSet({
      seeker,
      seekerPrefs,
      distanceKm: baseDistanceKm,
      relaxHardEligibility: true,
    });
    usedRelaxedFallback = baseCandidateSet.length > 0;
    if (usedRelaxedFallback) {
      logStep("fallback_relaxed_pool_used", {
        stage: "base",
        poolSize: baseCandidateSet.length,
      });
    }
  }
  const poolMode = resolvePoolMode({
    poolSize: baseCandidateSet.length,
    waitMs,
  });
  logStep("base_pool_computed", {
    basePoolSize: baseCandidateSet.length,
    poolMode,
  });

  const expandedDistanceKm = getDistanceForMode(baseDistanceKm, poolMode);
  let candidateSet =
    expandedDistanceKm === baseDistanceKm
      ? baseCandidateSet
      : await getCandidateSet({
          seeker,
          seekerPrefs,
          distanceKm: expandedDistanceKm,
        });
  if (!candidateSet.length && expandedDistanceKm !== baseDistanceKm) {
    candidateSet = await getCandidateSet({
      seeker,
      seekerPrefs,
      distanceKm: expandedDistanceKm,
      relaxHardEligibility: true,
    });
    if (candidateSet.length) {
      usedRelaxedFallback = true;
      logStep("fallback_relaxed_pool_used", {
        stage: "expanded",
        poolSize: candidateSet.length,
      });
    }
  }
  logStep("candidate_pool_finalized", {
    expandedDistanceKm,
    finalPoolSize: candidateSet.length,
    usedRelaxedFallback,
  });

  if (!candidateSet.length) {
    logStep("no_candidates");
    return null;
  }

  const [answersByUser, recentRematchSet] = await Promise.all([
    getAnswersByUser([
      seekerId,
      ...candidateSet.map((c) => c.user._id.toString()),
    ]),
    getRecentRematchSet(seekerId, now),
  ]);
  logStep("supporting_data_loaded", {
    usersWithAnswers: answersByUser.size,
    recentRematchCount: recentRematchSet.size,
  });

  const cacheKey = buildCacheKey({
    seeker,
    seekerPrefDoc,
    poolMode,
    candidates: candidateSet,
    answersByUser,
  });
  const cached = readCache(cacheKey, now);
  if (cached) {
    logStep("cache_hit", {
      matchedUserId: cached?.uid || null,
      mode: cached?.mode || null,
      score: cached?.score ?? null,
    });
    return cached;
  }
  logStep("cache_miss");

  const scored = candidateSet.map(({ user, prefs }) => {
    const candidateId = user._id.toString();
    const scoredCandidate = scoreCandidate({
      seeker,
      candidate: user,
      context: {
        seekerPrefs,
        candidatePrefs: prefs,
        poolMode,
        now,
        maxDistanceKm: expandedDistanceKm,
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

  const nonRematch = scored.filter((item) => !item.isRecentRematch);
  let filtered = scored;

  if (poolMode === POOL_MODE.SCARCE && nonRematch.length > 0) {
    filtered = nonRematch;
  }

  filtered = filtered
    .map((item) => ({
      ...item,
      totalScore: Math.max(
        0,
        item.totalScore - (item.isRecentRematch ? REMATCH_PENALTY : 0),
      ),
    }))
    .filter((item) => {
      if (poolMode === POOL_MODE.NORMAL)
        return item.totalScore >= NORMAL_MIN_SCORE;
      if (poolMode === POOL_MODE.LOW_POOL)
        return item.totalScore >= LOW_POOL_MIN_SCORE;
      return true;
    })
    .sort(compareCandidates);
  logStep("candidates_scored", {
    scoredCount: scored.length,
    filteredCount: filtered.length,
    nonRematchCount: nonRematch.length,
  });

  const winner = filtered[0];
  const result = winner
    ? {
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
          usedRelaxedFallback,
        }),
      }
    : null;
  logStep("result_computed", {
    matchedUserId: result?.uid || null,
    mode: result?.mode || null,
    score: result?.score ?? null,
  });

  writeCache(cacheKey, result, now);
  logStep("cache_written");
  return result;
};

export const getPreferenceBasedAvailableCount = async ({
  userId,
  now = new Date(),
}) => {
  const seeker = await User.findById(userId).select("_id").lean();
  if (!seeker) return 0;

  const pref = await UserPreference.findOne({ user: userId })
    .select("interestedIn ageRange")
    .lean();

  const ageRange = Array.isArray(pref?.ageRange) ? pref.ageRange : [18, 27];
  const minAge = Number(ageRange[0]) || 18;
  const maxAge = Number(ageRange[1]) || 27;

  const interestedIn = Array.isArray(pref?.interestedIn)
    ? pref.interestedIn
    : [pref?.interestedIn || "man"];
  const normalizedGenderPref = interestedIn
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);
  const allowsAnyGender = normalizedGenderPref.some((item) =>
    ["everyone", "all", "any"].includes(item)
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
    poolMode,
    now,
    maxDistanceKm,
    seekerAnswers,
    candidateAnswers,
  } = context;

  const profileRaw = scoreProfileAndPreference({
    seeker,
    candidate,
    seekerPrefs,
    candidatePrefs,
    maxDistanceKm,
  });
  const thisOrThatRaw = scoreThisOrThat(seekerAnswers, candidateAnswers);
  const fairnessRatio = getFairnessRatio(candidate.matchmakingTimestamp, now);

  const modeCaps =
    SCORE_CAPS_BY_MODE[poolMode] || SCORE_CAPS_BY_MODE[POOL_MODE.NORMAL];
  const profileScore = (profileRaw / 65) * modeCaps.profile;
  const thisOrThatScore = (thisOrThatRaw / 35) * modeCaps.thisOrThat;
  const fairnessScore = fairnessRatio * modeCaps.fairness;

  const totalScore = clampNumber(
    profileScore + thisOrThatScore + fairnessScore,
    0,
    100,
  );

  return {
    totalScore,
    componentScores: {
      profileScore,
      thisOrThatScore,
      fairnessScore,
    },
  };
};

async function getCandidateSet({
  seeker,
  seekerPrefs,
  distanceKm,
  relaxHardEligibility = false,
}) {
  const seekerId = seeker?._id?.toString?.() || "unknown";
  const logStep = () => {};

  logStep("start", { distanceKm, relaxHardEligibility });
  const [lng, lat] = seeker.location.coordinates;
  const rawCandidates = await User.findNearby(
    lng,
    lat,
    distanceKm * 1000,
    {
      isMatching: true,
      credits: { $gte: CREDIT_RULES.CONVERSATION_COST },
    },
    seeker._id.toString(),
    200,
  );
  logStep("nearby_fetched", { rawCount: rawCandidates.length });

  if (!rawCandidates.length) {
    logStep("no_raw_candidates");
    return [];
  }

  const candidateIds = rawCandidates.map((candidate) => candidate._id);
  const candidatePrefsDocs = await UserPreference.find({
    user: { $in: candidateIds },
  }).lean();
  logStep("candidate_preferences_fetched", {
    prefsCount: candidatePrefsDocs.length,
  });
  const candidatePrefsMap = new Map(
    candidatePrefsDocs.map((doc) => [
      doc.user.toString(),
      normalizePreference(doc),
    ]),
  );

  if (relaxHardEligibility) {
    const relaxedSelected = rawCandidates.map((candidate) => ({
      user: candidate,
      prefs:
        candidatePrefsMap.get(candidate._id.toString()) ||
        normalizePreference(null),
    }));
    logStep("hard_filter_skipped_relaxed", {
      selectedCount: relaxedSelected.length,
    });
    return relaxedSelected;
  }

  const reasonCounts = {
    missing_candidate_or_id: 0,
    missing_gender: 0,
    missing_dob: 0,
    interest_mismatch: 0,
    age_out_of_range: 0,
  };

  const selected = [];
  for (const candidate of rawCandidates) {
    const prefs =
      candidatePrefsMap.get(candidate._id.toString()) ||
      normalizePreference(null);
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

  logStep("hard_filter_completed", {
    selectedCount: selected.length,
    rejectedCount: rawCandidates.length - selected.length,
    reasons: reasonCounts,
  });

  return selected;
}

function passesHardEligibility({
  seeker,
  seekerPrefs,
  candidate,
  candidatePrefs,
}) {
  return getHardEligibilityResult({
    seeker,
    seekerPrefs,
    candidate,
    candidatePrefs,
  }).ok;
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
  if (!candidate.gender || !seeker.gender) {
    return { ok: false, reason: "missing_gender" };
  }
  if (!candidate.dob || !seeker.dob) {
    return { ok: false, reason: "missing_dob" };
  }

  const seekerInterestOk = isInterestedIn(
    seekerPrefs.interestedIn,
    candidate.gender,
  );
  const candidateInterestOk = isInterestedIn(
    candidatePrefs.interestedIn,
    seeker.gender,
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

function scoreProfileAndPreference({
  seeker,
  candidate,
  seekerPrefs,
  candidatePrefs,
  maxDistanceKm,
}) {
  const candidateAge = getAge(candidate.dob);
  const ageScore = ageClosenessScore(candidateAge, seekerPrefs.ageRange); // /10

  const goalScore = jaccard(
    compactGoals(seekerPrefs.goal),
    compactGoals(candidatePrefs.goal),
  ); // /8

  const relationshipScore =
    seekerPrefs.relationshipType &&
    candidatePrefs.relationshipType &&
    seekerPrefs.relationshipType === candidatePrefs.relationshipType
      ? 1
      : 0; // /6

  const interestsScore = jaccard(
    seekerPrefs.interests,
    candidatePrefs.interests,
  ); // /8
  const languagesScore = jaccard(
    seekerPrefs.languages,
    candidatePrefs.languages,
  ); // /8

  const traitsScore =
    singleTraitScore(seekerPrefs.dietPreference, candidate.diet) * 2 +
    singleTraitScore(seekerPrefs.zodiacPreference, candidate.zodiacSign) * 1 +
    singleTraitScore(
      seekerPrefs.personalityTypePreference,
      candidate.personalityType,
    ) *
      2 +
    singleTraitScore(seekerPrefs.religionPreference, candidate.religion) * 2 +
    singleTraitScore(
      seekerPrefs.drinkingPreference,
      candidate.lifestyle?.drinking,
    ) *
      2 +
    singleTraitScore(
      seekerPrefs.smokingPreference,
      candidate.lifestyle?.smoking,
    ) *
      2 +
    singleTraitScore(seekerPrefs.petPreference, candidate.lifestyle?.pets) * 1; // /12

  const distanceKm = Number(candidate.distance || 0) / 1000;
  const distanceScore = distanceAffinity(distanceKm, maxDistanceKm); // /8

  const interestedSoft = interestedSoftStrength(
    seekerPrefs.interestedIn,
    candidate.gender,
  ); // /5

  return clampNumber(
    interestedSoft * 5 +
      ageScore * 10 +
      goalScore * 8 +
      relationshipScore * 6 +
      interestsScore * 8 +
      languagesScore * 8 +
      traitsScore +
      distanceScore * 8,
    0,
    65,
  );
}

function scoreThisOrThat(seekerAnswers, candidateAnswers) {
  if (!seekerAnswers.size || !candidateAnswers.size) return 0;

  let shared = 0;
  let matched = 0;

  for (const [questionId, seekerSelection] of seekerAnswers.entries()) {
    if (!candidateAnswers.has(questionId)) continue;
    shared += 1;
    if (candidateAnswers.get(questionId) === seekerSelection) {
      matched += 1;
    }
  }

  if (!shared) return 0;

  const similarity = matched / shared;
  const confidence = Math.min(shared / 20, 1);

  return clampNumber(35 * similarity * confidence, 0, 35);
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

function normalizePreference(prefDoc) {
  const merged = { ...DEFAULT_PREFS, ...(prefDoc || {}) };
  const [minAge, maxAge] = Array.isArray(merged.ageRange)
    ? merged.ageRange
    : [18, 27];

  return {
    ...merged,
    interestedIn: normalizeInterestedIn(merged.interestedIn),
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

function normalizeInterestedIn(value) {
  const list = Array.isArray(value) ? value : [value];
  const normalized = list
    .map((item) =>
      String(item || "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
  return normalized.length ? normalized : ["man"];
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

function isInterestedIn(interestedIn, gender) {
  const g = String(gender || "")
    .trim()
    .toLowerCase();
  if (!g) return false;
  const normalized = normalizeInterestedIn(interestedIn);
  if (normalized.some((item) => ["everyone", "all", "any"].includes(item)))
    return true;
  return normalized.includes(g);
}

function interestedSoftStrength(interestedIn, gender) {
  const normalized = normalizeInterestedIn(interestedIn);
  if (normalized.some((item) => ["everyone", "all", "any"].includes(item)))
    return 0.7;
  return normalized.includes(String(gender || "").toLowerCase()) ? 1 : 0;
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
  if (pref.some((item) => ["any", "all", "everyone"].includes(item))) return 1;
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

function getDistanceForMode(baseDistanceKm, mode) {
  if (mode === POOL_MODE.LOW_POOL) {
    return Math.min(
      MAX_DISTANCE_KM,
      Math.max(baseDistanceKm * 1.5, baseDistanceKm + 5),
    );
  }
  if (mode === POOL_MODE.SCARCE) {
    return Math.min(
      MAX_DISTANCE_KM,
      Math.max(baseDistanceKm * 2.5, baseDistanceKm + 15),
    );
  }
  return baseDistanceKm;
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

function buildCacheKey({
  seeker,
  seekerPrefDoc,
  poolMode,
  candidates,
  answersByUser,
}) {
  const seekerId = seeker._id.toString();
  const candidateIds = candidates
    .map((item) => item.user._id.toString())
    .sort()
    .join(",");
  const candidatePrefUpdated = candidates
    .map((item) => String(item.prefs?.updatedAt || "0"))
    .join("|");
  const answersStamp = Array.from(answersByUser.entries())
    .map(([uid, answerMap]) => `${uid}:${answerMap.size}`)
    .sort()
    .join("|");

  const payload = [
    seekerId,
    poolMode,
    String(seeker.updatedAt || "0"),
    String(seekerPrefDoc?.updatedAt || "0"),
    candidateIds,
    candidatePrefUpdated,
    answersStamp,
  ].join("::");

  return crypto.createHash("sha1").update(payload).digest("hex");
}

function readCache(key, now) {
  const entry = scoreCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now.getTime()) {
    scoreCache.delete(key);
    return null;
  }
  return entry.value;
}

function writeCache(key, value, now) {
  scoreCache.set(key, {
    value,
    expiresAt: now.getTime() + CACHE_TTL_MS,
  });
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
  usedRelaxedFallback,
}) {
  const profileScore = round2(winner?.componentScores?.profileScore || 0);
  const thisOrThatScore = round2(winner?.componentScores?.thisOrThatScore || 0);
  const fairnessScore = round2(winner?.componentScores?.fairnessScore || 0);
  const totalScore = round2(winner?.totalScore || 0);
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
  if (profileScore > 0 && !reasons.includes("this_or_that_similarity")) {
    reasons.push("profile_preference_alignment");
  }
  if (fairnessScore > 0) reasons.push("wait_time_fairness_boost");
  if (usedRelaxedFallback) reasons.push("fallback_relaxed_eligibility");
  if (!reasons.length) reasons.push("last_resort_available_match");

  return {
    version: "matchmaking_v2",
    poolMode,
    totalScore,
    components: {
      profileScore,
      thisOrThatScore,
      fairnessScore,
    },
    isRecentRematch: Boolean(winner?.isRecentRematch),
    usedRelaxedFallback: Boolean(usedRelaxedFallback),
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
      pets: getExactMatchValue(seeker?.lifestyle?.pets, candidate?.lifestyle?.pets),
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
    matchRate: sharedAnswers ? round2((matchedAnswers / sharedAnswers) * 100) : 0,
  };
}

function getIntersection(a = [], b = []) {
  const setB = new Set((b || []).map((item) => String(item)));
  return Array.from(new Set((a || []).map((item) => String(item)))).filter((item) =>
    setB.has(item),
  );
}

function getExactMatchValue(a, b) {
  const left = String(a || "").trim().toLowerCase();
  const right = String(b || "").trim().toLowerCase();
  if (!left || !right) return null;
  return left === right ? left : null;
}
