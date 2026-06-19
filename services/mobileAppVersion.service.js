import MobileAppVersion, { PLATFORMS } from "../models/mobileAppVersion.model.js";

const SEMVER_PART = String.raw`\d+`;
const SEMVER_CORE = new RegExp(
  `^(${SEMVER_PART})(?:\\.(${SEMVER_PART}))?(?:\\.(${SEMVER_PART}))?(?:\\.(${SEMVER_PART}))?(?:[-+][0-9A-Za-z.-]+)?$`,
);

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizePlatform = (platform) => {
  const normalized = String(platform || "")
    .trim()
    .toLowerCase();
  if (!PLATFORMS.includes(normalized)) {
    const error = new Error(`Invalid platform. Expected one of: ${PLATFORMS.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }
  return normalized;
};

const normalizeVersionString = (value, { fieldName, required = true }) => {
  if (value === undefined || value === null) {
    if (!required) return undefined;
    const error = new Error(`${fieldName} is required`);
    error.statusCode = 400;
    throw error;
  }

  if (typeof value !== "string") {
    const error = new Error(`${fieldName} must be a string`);
    error.statusCode = 400;
    throw error;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    if (!required) return "";
    const error = new Error(`${fieldName} is required`);
    error.statusCode = 400;
    throw error;
  }

  if (!SEMVER_CORE.test(trimmed)) {
    const error = new Error(
      `${fieldName} must be a semantic-style version (e.g. 1.0.1)`,
    );
    error.statusCode = 400;
    throw error;
  }

  return trimmed;
};

const normalizeOptionalString = (value, { maxLength, fieldName }) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    const error = new Error(`${fieldName} must be a string`);
    error.statusCode = 400;
    throw error;
  }
  const trimmed = value.trim();
  if (maxLength && trimmed.length > maxLength) {
    const error = new Error(
      `${fieldName} must be at most ${maxLength} characters`,
    );
    error.statusCode = 400;
    throw error;
  }
  return trimmed;
};

const normalizeOptionalUrl = (value, { fieldName, required = false }) => {
  if (value === undefined || value === null) {
    if (required) {
      const error = new Error(`${fieldName} is required`);
      error.statusCode = 400;
      throw error;
    }
    return undefined;
  }

  if (typeof value !== "string") {
    const error = new Error(`${fieldName} must be a string URL`);
    error.statusCode = 400;
    throw error;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    if (required) {
      const error = new Error(`${fieldName} is required`);
      error.statusCode = 400;
      throw error;
    }
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      const error = new Error(`${fieldName} must use http or https`);
      error.statusCode = 400;
      throw error;
    }
  } catch {
    const error = new Error(`${fieldName} must be a valid http(s) URL`);
    error.statusCode = 400;
    throw error;
  }

  return trimmed;
};

const normalizeOptionalBoolean = (value, { fieldName }) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  const error = new Error(`${fieldName} must be a boolean`);
  error.statusCode = 400;
  throw error;
};

const normalizeVersionPayload = (input, { partial = false } = {}) => {
  if (!isPlainObject(input)) {
    const error = new Error("payload must be an object");
    error.statusCode = 400;
    throw error;
  }

  const payload = {};

  if (!partial || input.platform !== undefined) {
    payload.platform = normalizePlatform(input.platform);
  }

  if (!partial || input.latestVersion !== undefined) {
    payload.latestVersion = normalizeVersionString(input.latestVersion, {
      fieldName: "latestVersion",
    });
  }

  if (!partial || input.minimumSupportedVersion !== undefined) {
    payload.minimumSupportedVersion = normalizeVersionString(
      input.minimumSupportedVersion,
      { fieldName: "minimumSupportedVersion" },
    );
  }

  if (input.forceUpdate !== undefined) {
    payload.forceUpdate = normalizeOptionalBoolean(input.forceUpdate, {
      fieldName: "forceUpdate",
    });
  } else if (!partial) {
    payload.forceUpdate = false;
  }

  if (input.isActive !== undefined) {
    payload.isActive = normalizeOptionalBoolean(input.isActive, {
      fieldName: "isActive",
    });
  } else if (!partial) {
    payload.isActive = true;
  }

  if (input.playStoreUrl !== undefined) {
    payload.playStoreUrl = normalizeOptionalUrl(input.playStoreUrl, {
      fieldName: "playStoreUrl",
    });
  } else if (!partial) {
    payload.playStoreUrl = "";
  }

  if (input.appStoreUrl !== undefined) {
    payload.appStoreUrl = normalizeOptionalUrl(input.appStoreUrl, {
      fieldName: "appStoreUrl",
    });
  } else if (!partial) {
    payload.appStoreUrl = "";
  }

  if (input.updateTitle !== undefined) {
    payload.updateTitle = normalizeOptionalString(input.updateTitle, {
      fieldName: "updateTitle",
      maxLength: 120,
    });
  }

  if (input.updateMessage !== undefined) {
    payload.updateMessage = normalizeOptionalString(input.updateMessage, {
      fieldName: "updateMessage",
      maxLength: 1000,
    });
  }

  if (payload.platform === "android" && payload.playStoreUrl === "") {
    payload.playStoreUrl = "";
  }

  return payload;
};

export const getActiveAppVersionForPlatform = async (platform) => {
  const normalizedPlatform = normalizePlatform(platform);
  return MobileAppVersion.findOne({
    platform: normalizedPlatform,
    isActive: true,
  })
    .sort({ updatedAt: -1 })
    .lean();
};

export const listAdminAppVersions = async () => {
  return MobileAppVersion.find({}).sort({ platform: 1, updatedAt: -1 }).lean();
};

export const getAdminAppVersionById = async (id) => {
  return MobileAppVersion.findById(id).lean();
};

export const createAdminAppVersion = async ({ payload, userId }) => {
  const normalized = normalizeVersionPayload(payload, { partial: false });

  const existing = await MobileAppVersion.findOne({
    platform: normalized.platform,
  }).lean();
  if (existing) {
    const error = new Error(
      `An app version config for "${normalized.platform}" already exists. Edit it instead of creating a duplicate.`,
    );
    error.statusCode = 409;
    throw error;
  }

  const created = await MobileAppVersion.create({
    ...normalized,
    lastUpdatedBy: userId || null,
  });
  return created.toObject();
};

export const updateAdminAppVersion = async ({ id, payload, userId }) => {
  const normalized = normalizeVersionPayload(payload, { partial: true });

  const updated = await MobileAppVersion.findByIdAndUpdate(
    id,
    {
      $set: {
        ...normalized,
        lastUpdatedBy: userId || null,
      },
    },
    { new: true, runValidators: true },
  ).lean();

  return updated;
};

export const deleteAdminAppVersion = async (id) => {
  const deleted = await MobileAppVersion.findByIdAndDelete(id).lean();
  return deleted;
};

export const sanitizePublicAppVersion = (doc) => {
  if (!doc) return null;
  return {
    platform: doc.platform || null,
    latestVersion: doc.latestVersion || null,
    minimumSupportedVersion: doc.minimumSupportedVersion || null,
    forceUpdate: Boolean(doc.forceUpdate),
    playStoreUrl: doc.playStoreUrl || "",
    appStoreUrl: doc.appStoreUrl || "",
    updateTitle: doc.updateTitle || "Update available",
    updateMessage:
      doc.updateMessage ||
      "A new version of the app is available. Please update for the best experience.",
    isActive: doc.isActive !== false,
    updatedAt: doc.updatedAt || null,
  };
};

export const sanitizeAdminAppVersion = (doc) => {
  if (!doc) return null;
  return {
    _id: doc._id,
    platform: doc.platform || null,
    latestVersion: doc.latestVersion || "",
    minimumSupportedVersion: doc.minimumSupportedVersion || "",
    forceUpdate: Boolean(doc.forceUpdate),
    playStoreUrl: doc.playStoreUrl || "",
    appStoreUrl: doc.appStoreUrl || "",
    updateTitle:
      doc.updateTitle || "Update available",
    updateMessage:
      doc.updateMessage ||
      "A new version of the app is available. Please update for the best experience.",
    isActive: doc.isActive !== false,
    lastUpdatedBy: doc.lastUpdatedBy || null,
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
  };
};

export { normalizePlatform };