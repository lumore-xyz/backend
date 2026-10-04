import MobileAppVersion, { PLATFORMS } from "../models/mobileAppVersion.model.js";
import { isPlainObject } from "../utils/object.js";
import { normalizeString } from "../utils/strings.js";

const SEMVER_PART = String.raw`\d+`;
const SEMVER_CORE = new RegExp(
  `^(${SEMVER_PART})(?:\\.(${SEMVER_PART}))?(?:\\.(${SEMVER_PART}))?(?:\\.(${SEMVER_PART}))?(?:[-+][0-9A-Za-z.-]+)?$`,
);

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

const normalizePlatform = (platform) => {
  const normalized = normalizeString(platform);
  if (!PLATFORMS.includes(normalized)) {
    throw badRequest(`Invalid platform. Expected one of: ${PLATFORMS.join(", ")}`);
  }
  return normalized;
};

const normalizeVersionString = (value, { fieldName, required = true }) => {
  if (value === undefined || value === null) {
    if (!required) return undefined;
    throw badRequest(`${fieldName} is required`);
  }

  if (typeof value !== "string") {
    throw badRequest(`${fieldName} must be a string`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    if (!required) return "";
    throw badRequest(`${fieldName} is required`);
  }

  if (!SEMVER_CORE.test(trimmed)) {
    throw badRequest(`${fieldName} must be a semantic-style version (e.g. 1.0.1)`);
  }

  return trimmed;
};

const normalizeOptionalString = (value, { maxLength, fieldName }) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw badRequest(`${fieldName} must be a string`);
  }
  const trimmed = value.trim();
  if (maxLength && trimmed.length > maxLength) {
    throw badRequest(`${fieldName} must be at most ${maxLength} characters`);
  }
  return trimmed;
};

const normalizeOptionalUrl = (value, { fieldName, required = false }) => {
  if (value === undefined || value === null) {
    if (required) {
      throw badRequest(`${fieldName} is required`);
    }
    return undefined;
  }

  if (typeof value !== "string") {
    throw badRequest(`${fieldName} must be a string URL`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    if (required) {
      throw badRequest(`${fieldName} is required`);
    }
    return "";
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw badRequest(`${fieldName} must be a valid http(s) URL`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw badRequest(`${fieldName} must use http or https`);
  }

  return trimmed;
};

const normalizeOptionalBoolean = (value, { fieldName }) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw badRequest(`${fieldName} must be a boolean`);
};

const normalizeVersionPayload = (input, { partial = false } = {}) => {
  if (!isPlainObject(input)) {
    throw badRequest("payload must be an object");
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

const sanitizeAppVersionFields = (doc, versionFallback) => ({
  platform: doc.platform || null,
  latestVersion: doc.latestVersion || versionFallback,
  minimumSupportedVersion: doc.minimumSupportedVersion || versionFallback,
  forceUpdate: Boolean(doc.forceUpdate),
  playStoreUrl: doc.playStoreUrl || "",
  appStoreUrl: doc.appStoreUrl || "",
  updateTitle: doc.updateTitle || "Update available",
  updateMessage:
    doc.updateMessage ||
    "A new version of the app is available. Please update for the best experience.",
  isActive: doc.isActive !== false,
});

export const sanitizePublicAppVersion = (doc) => {
  if (!doc) return null;
  return {
    ...sanitizeAppVersionFields(doc, null),
    updatedAt: doc.updatedAt || null,
  };
};

export const sanitizeAdminAppVersion = (doc) => {
  if (!doc) return null;
  return {
    _id: doc._id,
    ...sanitizeAppVersionFields(doc, ""),
    lastUpdatedBy: doc.lastUpdatedBy || null,
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
  };
};

export { normalizePlatform };
