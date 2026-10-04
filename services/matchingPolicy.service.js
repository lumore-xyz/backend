import {
  normalizeStringArray,
  normalizeStringList,
  normalizeString,
} from "../utils/strings.js";
import {
  ANY_GENDER_VALUES,
  inferInterestedInFromGender,
  SUPPORTED_GENDERS,
} from "../utils/userPreferences.js";
import { getAge } from "../utils/age.js";

const MAX_DISTANCE_KM = 100;
const DEFAULT_PREFS = {
  interestedIn: null,
  ageRange: [18, 27],
  distance: 50,
  goal: { primary: null, secondary: null, tertiary: null },
  interests: [],
  relationshipType: null,
  languages: [],
  zodiacPreference: [],
  personalityTypePreference: [],
  dietPreference: [],
  heightRange: [120, 200],
  religionPreference: [],
  drinkingPreference: [],
  smokingPreference: [],
  petPreference: [],
};

export function normalizePreference(prefDoc, { userGender } = {}) {
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
  const normalized = normalizeStringList(value);

  if (normalized.some((item) => ANY_GENDER_VALUES.has(item))) return ["any"];

  const genders = normalized.filter((item) => isSupportedGender(item));
  if (genders.length) return Array.from(new Set(genders));

  const inferred = inferInterestedInFromGender(userGender);
  return inferred ? [inferred] : [];
}

export function compactGoals(goal) {
  return normalizeStringList([goal?.primary, goal?.secondary, goal?.tertiary]);
}

function isInterestedIn(interestedIn, gender, { userGender } = {}) {
  const targetGender = normalizeString(gender);
  if (!isSupportedGender(targetGender)) return false;

  const normalized = normalizeInterestedIn(interestedIn, { userGender });
  if (!normalized.length) return false;
  if (normalized.includes("any")) return true;
  return normalized.includes(targetGender);
}

export function getHardEligibilityResult({
  seeker,
  seekerPrefs,
  candidate,
  candidatePrefs,
  ageRelaxationYears = 0,
  now,
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

  const seekerAge = getAge(seeker.dob, now);
  const candidateAge = getAge(candidate.dob, now);
  const seekerAgeRange = expandAgeRange(
    seekerPrefs.ageRange,
    ageRelaxationYears,
  );
  const candidateAgeRange = expandAgeRange(
    candidatePrefs.ageRange,
    ageRelaxationYears,
  );
  if (!isAgeInRange(candidateAge, seekerAgeRange)) {
    return { ok: false, reason: "age_out_of_range" };
  }
  if (!isAgeInRange(seekerAge, candidateAgeRange)) {
    return { ok: false, reason: "age_out_of_range" };
  }

  return { ok: true, reason: "ok" };
}

function expandAgeRange(range, relaxationYears = 0) {
  if (!range) return range;
  const years = Math.max(0, Number(relaxationYears) || 0);
  return {
    min: Math.max(18, range.min - years),
    max: range.max + years,
  };
}

function isAgeInRange(age, range) {
  if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max))
    return false;
  if (!Number.isFinite(age)) return false;
  return age >= range.min && age <= range.max;
}

function clampDistanceKm(distance) {
  const parsed = Number(distance);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PREFS.distance;
  return Math.min(parsed, MAX_DISTANCE_KM);
}

export function getIntersection(a = [], b = []) {
  const setB = new Set((b || []).map((item) => String(item)));
  return Array.from(new Set((a || []).map((item) => String(item)))).filter(
    (item) => setB.has(item),
  );
}

export function getCommonalityBreakdown({
  seeker,
  candidate,
  seekerPrefs,
  candidatePrefs,
  normalizeLists = normalizeStringArray,
}) {
  return {
    goals: getIntersection(
      compactGoals(seekerPrefs?.goal),
      compactGoals(candidatePrefs?.goal),
    ),
    interests: getIntersection(
      normalizeLists(seeker?.interests || []),
      normalizeLists(candidate?.interests || []),
    ),
    languages: getIntersection(
      normalizeLists(seeker?.languages || []),
      normalizeLists(candidate?.languages || []),
    ),
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

export function getExactMatchValue(a, b) {
  const left = normalizeString(a);
  const right = normalizeString(b);
  if (!left || !right) return null;
  return left === right ? left : null;
}

function isSupportedGender(value) {
  return SUPPORTED_GENDERS.has(normalizeString(value));
}

