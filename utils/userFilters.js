const USER_STRING_FILTER_KEYS = [
  "username",
  "email",
  "phoneNumber",
  "nickname",
  "realName",
  "gender",
  "country",
  "pincode",
  "diet",
  "zodiacSign",
  "maritalStatus",
  "religion",
  "hometown",
  "personalityType",
  "bloodGroup",
  "verificationStatus",
  "verificationMethod",
  "work",
  "institution",
  "drinking",
  "smoking",
  "pets",
];

const USER_BOOLEAN_FILTER_KEYS = [
  "isActive",
  "isArchived",
  "isMatching",
  "isVerified",
  "emailVerified",
  "phoneVerified",
  "isAdmin",
];

const USER_NUMBER_FILTER_KEYS = [
  "minAge",
  "maxAge",
  "minHeight",
  "maxHeight",
  "minCredits",
  "maxCredits",
];

const USER_ARRAY_FILTER_KEYS = ["interests", "languages", "web3Wallet"];

const PREFERENCE_STRING_FILTER_KEYS = [
  "prefInterestedIn",
  "prefRelationshipType",
  "prefGoalPrimary",
  "prefGoalSecondary",
  "prefGoalTertiary",
];

const PREFERENCE_NUMBER_FILTER_KEYS = [
  "prefMinDistance",
  "prefMaxDistance",
  "prefAgeMin",
  "prefAgeMax",
  "prefHeightMin",
  "prefHeightMax",
];

const PREFERENCE_ARRAY_FILTER_KEYS = [
  "prefInterests",
  "prefLanguages",
  "prefZodiac",
  "prefPersonality",
  "prefDiet",
  "prefReligion",
  "prefDrinking",
  "prefSmoking",
  "prefPets",
];

const FILTER_KEYS = [
  ...USER_STRING_FILTER_KEYS,
  ...USER_BOOLEAN_FILTER_KEYS,
  ...USER_NUMBER_FILTER_KEYS,
  ...USER_ARRAY_FILTER_KEYS,
  ...PREFERENCE_STRING_FILTER_KEYS,
  ...PREFERENCE_NUMBER_FILTER_KEYS,
  ...PREFERENCE_ARRAY_FILTER_KEYS,
];

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeString = (value) => String(value || "").trim();

const parseBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  return null;
};

const parseNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const parseStringArray = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeString(item))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return null;
};

const hasAnyFilter = (filters) => Object.keys(filters || {}).length > 0;

const buildRegexEquals = (value) => new RegExp(`^${escapeRegex(value)}$`, "i");

const buildRegexAny = (values) => values.map((value) => buildRegexEquals(value));

export const sanitizeUserFilters = (rawFilters) => {
  if (rawFilters === undefined || rawFilters === null) {
    return { filters: {} };
  }

  if (typeof rawFilters !== "object" || Array.isArray(rawFilters)) {
    return { error: "filters must be an object" };
  }

  const filters = {};

  for (const key of FILTER_KEYS) {
    const rawValue = rawFilters[key];
    if (rawValue === undefined || rawValue === null || rawValue === "") continue;

    if (USER_STRING_FILTER_KEYS.includes(key) || PREFERENCE_STRING_FILTER_KEYS.includes(key)) {
      const value = normalizeString(rawValue);
      if (!value) continue;
      filters[key] = value;
      continue;
    }

    if (USER_BOOLEAN_FILTER_KEYS.includes(key)) {
      const value = parseBoolean(rawValue);
      if (value === null) {
        return { error: `filters.${key} must be a boolean` };
      }
      filters[key] = value;
      continue;
    }

    if (USER_NUMBER_FILTER_KEYS.includes(key) || PREFERENCE_NUMBER_FILTER_KEYS.includes(key)) {
      const value = parseNumber(rawValue);
      if (value === null) {
        return { error: `filters.${key} must be a number` };
      }
      filters[key] = value;
      continue;
    }

    if (USER_ARRAY_FILTER_KEYS.includes(key) || PREFERENCE_ARRAY_FILTER_KEYS.includes(key)) {
      const value = parseStringArray(rawValue);
      if (!value) {
        return { error: `filters.${key} must be a string array or comma-separated string` };
      }
      if (!value.length) continue;
      filters[key] = Array.from(new Set(value));
    }
  }

  return { filters };
};

export const splitUserAndPreferenceFilters = (filters = {}) => {
  const userFilters = {};
  const preferenceFilters = {};

  for (const [key, value] of Object.entries(filters)) {
    if (key.startsWith("pref")) {
      preferenceFilters[key] = value;
    } else {
      userFilters[key] = value;
    }
  }

  return { userFilters, preferenceFilters };
};

export const buildUserFilterClauses = (filters = {}) => {
  const clauses = [];

  if (filters.gender) {
    clauses.push({ gender: { $regex: buildRegexEquals(filters.gender) } });
  }

  if (filters.country) {
    clauses.push({ "location.formattedAddress": { $type: "string", $ne: "" } });
    clauses.push({
      $expr: {
        $eq: [
          {
            $toLower: {
              $trim: {
                input: {
                  $arrayElemAt: [
                    {
                      $split: [{ $trim: { input: "$location.formattedAddress" } }, ","],
                    },
                    -1,
                  ],
                },
              },
            },
          },
          filters.country.trim().toLowerCase(),
        ],
      },
    });
  }

  if (filters.pincode) {
    const escaped = escapeRegex(filters.pincode.trim());
    clauses.push({
      "location.formattedAddress": {
        $regex: new RegExp(`(^|[^0-9A-Za-z])${escaped}([^0-9A-Za-z]|$)`, "i"),
      },
    });
  }

  if (filters.minAge !== undefined || filters.maxAge !== undefined) {
    const now = new Date();
    const dobRange = {};

    if (filters.maxAge !== undefined) {
      const minDob = new Date(now);
      minDob.setFullYear(now.getFullYear() - Number(filters.maxAge) - 1);
      dobRange.$gte = minDob;
    }
    if (filters.minAge !== undefined) {
      const maxDob = new Date(now);
      maxDob.setFullYear(now.getFullYear() - Number(filters.minAge));
      dobRange.$lte = maxDob;
    }

    clauses.push({ dob: dobRange });
  }

  if (filters.minHeight !== undefined || filters.maxHeight !== undefined) {
    const range = {};
    if (filters.minHeight !== undefined) range.$gte = Number(filters.minHeight);
    if (filters.maxHeight !== undefined) range.$lte = Number(filters.maxHeight);
    clauses.push({ height: range });
  }

  if (filters.minCredits !== undefined || filters.maxCredits !== undefined) {
    const range = {};
    if (filters.minCredits !== undefined) range.$gte = Number(filters.minCredits);
    if (filters.maxCredits !== undefined) range.$lte = Number(filters.maxCredits);
    clauses.push({ credits: range });
  }

  const scalarMappings = [
    ["username", "username"],
    ["email", "email"],
    ["phoneNumber", "phoneNumber"],
    ["nickname", "nickname"],
    ["realName", "realName"],
    ["diet", "diet"],
    ["zodiacSign", "zodiacSign"],
    ["maritalStatus", "maritalStatus"],
    ["religion", "religion"],
    ["hometown", "hometown"],
    ["personalityType", "personalityType"],
    ["bloodGroup", "bloodGroup"],
    ["verificationStatus", "verificationStatus"],
    ["verificationMethod", "verificationMethod"],
    ["work", "work"],
    ["institution", "institution"],
    ["drinking", "lifestyle.drinking"],
    ["smoking", "lifestyle.smoking"],
    ["pets", "lifestyle.pets"],
  ];

  for (const [key, path] of scalarMappings) {
    if (filters[key]) {
      clauses.push({
        [path]: { $regex: buildRegexEquals(filters[key]) },
      });
    }
  }

  for (const key of USER_BOOLEAN_FILTER_KEYS) {
    if (filters[key] !== undefined) {
      clauses.push({ [key]: filters[key] });
    }
  }

  if (Array.isArray(filters.interests) && filters.interests.length) {
    clauses.push({ interests: { $in: buildRegexAny(filters.interests) } });
  }

  if (Array.isArray(filters.languages) && filters.languages.length) {
    clauses.push({ languages: { $in: buildRegexAny(filters.languages) } });
  }

  if (Array.isArray(filters.web3Wallet) && filters.web3Wallet.length) {
    clauses.push({ web3Wallet: { $in: buildRegexAny(filters.web3Wallet) } });
  }

  return clauses;
};

export const buildPreferenceFilter = (filters = {}) => {
  const clauses = [];

  const prefScalarMappings = [
    ["prefInterestedIn", "interestedIn"],
    ["prefRelationshipType", "relationshipType"],
    ["prefGoalPrimary", "goal.primary"],
    ["prefGoalSecondary", "goal.secondary"],
    ["prefGoalTertiary", "goal.tertiary"],
  ];

  for (const [key, path] of prefScalarMappings) {
    if (filters[key]) {
      clauses.push({ [path]: { $regex: buildRegexEquals(filters[key]) } });
    }
  }

  if (filters.prefMinDistance !== undefined || filters.prefMaxDistance !== undefined) {
    const range = {};
    if (filters.prefMinDistance !== undefined) range.$gte = Number(filters.prefMinDistance);
    if (filters.prefMaxDistance !== undefined) range.$lte = Number(filters.prefMaxDistance);
    clauses.push({ distance: range });
  }

  if (filters.prefAgeMin !== undefined) {
    clauses.push({ "ageRange.0": { $gte: Number(filters.prefAgeMin) } });
  }
  if (filters.prefAgeMax !== undefined) {
    clauses.push({ "ageRange.1": { $lte: Number(filters.prefAgeMax) } });
  }
  if (filters.prefHeightMin !== undefined) {
    clauses.push({ "heightRange.0": { $gte: Number(filters.prefHeightMin) } });
  }
  if (filters.prefHeightMax !== undefined) {
    clauses.push({ "heightRange.1": { $lte: Number(filters.prefHeightMax) } });
  }

  const prefArrayMappings = [
    ["prefInterests", "interests"],
    ["prefLanguages", "languages"],
    ["prefZodiac", "zodiacPreference"],
    ["prefPersonality", "personalityTypePreference"],
    ["prefDiet", "dietPreference"],
    ["prefReligion", "religionPreference"],
    ["prefDrinking", "drinkingPreference"],
    ["prefSmoking", "smokingPreference"],
    ["prefPets", "petPreference"],
  ];

  for (const [key, path] of prefArrayMappings) {
    if (Array.isArray(filters[key]) && filters[key].length) {
      clauses.push({ [path]: { $in: buildRegexAny(filters[key]) } });
    }
  }

  return clauses.length ? { $and: clauses } : {};
};

export const hasPreferenceFilters = (filters = {}) =>
  Object.keys(filters).some((key) => key.startsWith("pref"));

export const hasAnySupportedFilters = hasAnyFilter;
