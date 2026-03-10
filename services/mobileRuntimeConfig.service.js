import MobileRuntimeConfig from "../models/mobileRuntimeConfig.model.js";

const DEFAULT_KEY = "global";

const STRING_FIELDS = [
  "BASE_URL",
  "SOCKET_URL",
  "GOOGLE_WEB_CLIENT_ID",
  "IOS_URL_SCHEMA",
  "ONESIGNAL_APP_ID",
  "ADMOB_ANDROID_INTERSTITIAL_ID",
  "ADMOB_IOS_INTERSTITIAL_ID",
  "ADMOB_ANDROID_REWARDED_UNIT_ID",
  "ADMOB_IOS_REWARDED_UNIT_ID",
  "PLAYSTORE_URL",
  "APPSTORE_URL",
];

const ALLOWED_FIELDS = [...STRING_FIELDS, "featureFlags"];
const URL_FIELDS = new Set(["BASE_URL", "SOCKET_URL", "PLAYSTORE_URL", "APPSTORE_URL"]);
const REQUIRED_URL_FIELDS = new Set(["BASE_URL", "SOCKET_URL"]);
const ALLOWED_FIELD_SET = new Set(ALLOWED_FIELDS);
const DEFAULT_ENVIRONMENT = String(process.env.NODE_ENV || "development").toLowerCase();

const DEFAULT_RUNTIME_CONFIG = {
  BASE_URL: "https://api.lumore.xyz",
  SOCKET_URL: "https://api.lumore.xyz/api/chat",
  GOOGLE_WEB_CLIENT_ID:
    "681858960345-vdjvn8t4sh9du8p396bv9krcf3irjc6s.apps.googleusercontent.com",
  IOS_URL_SCHEMA:
    "com.googleusercontent.apps.681858960345-t8llre06pgn2pegq01kjgukhmuiu46kf",
  ADMOB_ANDROID_INTERSTITIAL_ID: "ca-app-pub-5845343690682759/4569153863",
  ADMOB_IOS_INTERSTITIAL_ID: "ca-app-pub-5845343690682759/3780189521",
  ADMOB_ANDROID_REWARDED_UNIT_ID: "ca-app-pub-5845343690682759/7284110832",
  ADMOB_IOS_REWARDED_UNIT_ID: "ca-app-pub-5845343690682759/1563780217",
  ONESIGNAL_APP_ID: "1763039e-c3e6-45d6-846d-17cf9868f189",
  PLAYSTORE_URL:
    "https://play.google.com/store/apps/details?id=xyz.lumore.www.twa",
  APPSTORE_URL:
    "https://play.google.com/store/apps/details?id=xyz.lumore.www.twa",
  featureFlags: {},
};

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isFeatureFlagValue = (value) =>
  value === null ||
  typeof value === "boolean" ||
  typeof value === "number" ||
  typeof value === "string";

const normalizeEnvironment = (environment) => {
  const normalized = String(environment || DEFAULT_ENVIRONMENT)
    .trim()
    .toLowerCase();
  return normalized || DEFAULT_ENVIRONMENT;
};

const normalizeFeatureFlags = (featureFlags) => {
  if (!isPlainObject(featureFlags)) {
    throw new Error("featureFlags must be an object");
  }

  const normalized = {};

  Object.entries(featureFlags).forEach(([flagKey, flagValue]) => {
    const normalizedKey = String(flagKey || "").trim();
    if (!normalizedKey) return;

    if (!isFeatureFlagValue(flagValue)) {
      throw new Error(
        `featureFlags.${normalizedKey} must be a string, number, boolean or null`,
      );
    }

    normalized[normalizedKey] =
      typeof flagValue === "string" ? flagValue.trim() : flagValue;
  });

  return normalized;
};

const normalizeStringField = (key, value) => {
  if (typeof value !== "string") {
    throw new Error(`${key} must be a string`);
  }

  const normalized = value.trim();
  if (!normalized) {
    if (REQUIRED_URL_FIELDS.has(key)) {
      throw new Error(`${key} cannot be empty`);
    }
    return normalized;
  }

  if (URL_FIELDS.has(key)) {
    let parsed;
    try {
      parsed = new URL(normalized);
    } catch {
      throw new Error(`${key} must be a valid URL`);
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error(`${key} must use http or https`);
    }
  }

  return normalized;
};

export const validateAndNormalizeRuntimeConfigPatch = (patch) => {
  if (!isPlainObject(patch)) {
    throw new Error("config payload must be an object");
  }

  const normalizedPatch = {};

  Object.entries(patch).forEach(([key, value]) => {
    if (!ALLOWED_FIELD_SET.has(key)) {
      throw new Error(`Unknown runtime config key: ${key}`);
    }

    if (key === "featureFlags") {
      normalizedPatch.featureFlags = normalizeFeatureFlags(value);
      return;
    }

    normalizedPatch[key] = normalizeStringField(key, value);
  });

  return normalizedPatch;
};

export const sanitizePublicRuntimeConfig = (config = {}) => {
  if (!isPlainObject(config)) return { ...DEFAULT_RUNTIME_CONFIG };

  const sanitized = {};

  ALLOWED_FIELDS.forEach((key) => {
    if (key === "featureFlags") {
      const featureFlags = config.featureFlags;
      if (isPlainObject(featureFlags)) {
        try {
          sanitized.featureFlags = normalizeFeatureFlags(featureFlags);
        } catch {
          sanitized.featureFlags = {};
        }
      } else {
        sanitized.featureFlags = {};
      }
      return;
    }

    const value = config[key];
    if (typeof value !== "string") {
      sanitized[key] = REQUIRED_URL_FIELDS.has(key)
        ? DEFAULT_RUNTIME_CONFIG[key]
        : "";
      return;
    }

    const trimmedValue = value.trim();
    if (!trimmedValue && REQUIRED_URL_FIELDS.has(key)) {
      sanitized[key] = DEFAULT_RUNTIME_CONFIG[key];
      return;
    }

    if (URL_FIELDS.has(key) && trimmedValue) {
      try {
        const parsed = new URL(trimmedValue);
        sanitized[key] = ["http:", "https:"].includes(parsed.protocol)
          ? trimmedValue
          : DEFAULT_RUNTIME_CONFIG[key];
      } catch {
        sanitized[key] = DEFAULT_RUNTIME_CONFIG[key];
      }
      return;
    }

    sanitized[key] = trimmedValue;
  });

  return {
    ...DEFAULT_RUNTIME_CONFIG,
    ...sanitized,
  };
};

export const getOrCreateMobileRuntimeConfig = async ({ environment } = {}) => {
  const normalizedEnvironment = normalizeEnvironment(environment);

  let doc = await MobileRuntimeConfig.findOne({
    key: DEFAULT_KEY,
    environment: normalizedEnvironment,
  }).lean();

  if (!doc) {
    const created = await MobileRuntimeConfig.create({
      key: DEFAULT_KEY,
      environment: normalizedEnvironment,
      config: DEFAULT_RUNTIME_CONFIG,
      version: new Date().toISOString(),
    });

    doc = created.toObject();
  }

  const sanitizedConfig = sanitizePublicRuntimeConfig(doc.config || {});
  const needsPatch =
    JSON.stringify(sanitizedConfig) !== JSON.stringify(doc.config || {});

  if (needsPatch) {
    const nextVersion = new Date().toISOString();
    const patched = await MobileRuntimeConfig.findOneAndUpdate(
      { key: DEFAULT_KEY, environment: normalizedEnvironment },
      {
        $set: {
          config: sanitizedConfig,
          version: nextVersion,
        },
      },
      { returnDocument: "after" },
    ).lean();

    return patched;
  }

  return doc;
};

export const updateMobileRuntimeConfig = async ({
  configPatch,
  userId,
  environment,
}) => {
  const normalizedEnvironment = normalizeEnvironment(environment);
  const existing = await getOrCreateMobileRuntimeConfig({
    environment: normalizedEnvironment,
  });
  const normalizedPatch = validateAndNormalizeRuntimeConfigPatch(configPatch);

  const mergedConfig = sanitizePublicRuntimeConfig({
    ...(existing?.config || {}),
    ...normalizedPatch,
  });

  const nextVersion = new Date().toISOString();

  const updated = await MobileRuntimeConfig.findOneAndUpdate(
    { key: DEFAULT_KEY, environment: normalizedEnvironment },
    {
      $set: {
        config: mergedConfig,
        version: nextVersion,
        lastUpdatedBy: userId || null,
      },
    },
    { returnDocument: "after" },
  ).lean();

  return updated;
};
