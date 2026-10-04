import { extractLocationTags } from "../utils/location.js";
import { getId } from "../utils/matchIds.js";
import { trimString } from "../utils/strings.js";
import { getUtcDateKey } from "../utils/utcDate.js";
import { ONESIGNAL_APP_ID, oneSignalClient } from "../config/oneSignal.js";

const PROFILE_TAG_KEYS = ["nickname", "gender", "location.country"];

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const normalizeDate = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return getUtcDateKey(date);
};

const toTagValue = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (value instanceof Date) return normalizeDate(value);
  return trimString(value);
};

const getOneSignalUserTags = (oneSignalUser) => {
  const tags = oneSignalUser?.properties?.tags;
  if (!tags || typeof tags !== "object" || Array.isArray(tags)) {
    return {};
  }

  return Object.entries(tags).reduce((acc, [key, value]) => {
    acc[String(key)] = toTagValue(value);
    return acc;
  }, {});
};

const buildTagUpdatePatch = (desiredTags, existingTags) =>
  PROFILE_TAG_KEYS.reduce((acc, key) => {
    const nextValue = toTagValue(desiredTags?.[key]);
    const currentValue = toTagValue(existingTags?.[key]);

    if (nextValue === "") {
      // OneSignal docs: set "" to remove existing tags.
      if (currentValue !== "") {
        acc[key] = "";
      }
      return acc;
    }

    if (currentValue !== nextValue) {
      acc[key] = nextValue;
    }

    return acc;
  }, {});

export const buildOneSignalProfileTags = (user = {}) => {
  const { country } = extractLocationTags(user?.location?.formattedAddress);
  return {
    nickname: toTagValue(user?.nickname),
    gender: toTagValue(user?.gender),
    "location.country": toTagValue(country),
  };
};

const getErrorCode = (error) => {
  const code = Number(error?.code || error?.statusCode || error?.response?.status);
  return Number.isFinite(code) ? code : null;
};

const getOneSignalBodyErrorCodes = (error) => {
  const body = error?.body || error?.response?.body || null;
  const bodyErrors = body?.errors;
  if (!Array.isArray(bodyErrors)) return [];

  return bodyErrors
    .map((item) => String(item?.code || "").trim())
    .filter(Boolean);
};

const isEntitlementsTagLimitError = (error) =>
  getOneSignalBodyErrorCodes(error).includes("entitlements-tag-limit");

const getPatchKeysByPriority = (patch) =>
  PROFILE_TAG_KEYS.filter((key) => Object.hasOwn(patch, key));

const applyTagsWithEntitlementAwareBootstrap = async ({
  client,
  appId,
  userId,
  tagsPatch,
}) => {
  const orderedPatchKeys = getPatchKeysByPriority(tagsPatch);
  const appliedKeys = [];

  for (const key of orderedPatchKeys) {
    const singleKeyPatch = { [key]: tagsPatch[key] };

    try {
      await client.updateUser(appId, "external_id", userId, {
        properties: { tags: singleKeyPatch },
      });
      appliedKeys.push(key);
    } catch (error) {
      if (getErrorCode(error) === 409 && isEntitlementsTagLimitError(error)) {
        return {
          appliedKeys,
          blockedKey: key,
        };
      }

      throw error;
    }
  }

  return {
    appliedKeys,
    blockedKey: null,
  };
};

const isNotFoundError = (error) => getErrorCode(error) === 404;

export const syncUserProfileTagsToOneSignal = async (user, dependencies = {}) => {
  const appId = dependencies.appId ?? ONESIGNAL_APP_ID;
  const client = dependencies.client ?? oneSignalClient;
  const userId = getId(user).trim();
  let existingTags = {};

  if (!appId || !client) {
    return { skipped: true, reason: "not_configured" };
  }

  if (!userId) {
    return { skipped: true, reason: "missing_user_id" };
  }

  try {
    const existingUser = await client.getUser(appId, "external_id", userId);
    existingTags = getOneSignalUserTags(existingUser);
  } catch (error) {
    if (isNotFoundError(error)) {
      return { skipped: true, reason: "user_not_found_in_onesignal" };
    }
    throw error;
  }

  const desiredTags = buildOneSignalProfileTags(user);
  const tagsPatch = buildTagUpdatePatch(desiredTags, existingTags);

  if (!Object.keys(tagsPatch).length) {
    return { skipped: true, reason: "no_tag_changes" };
  }

  try {
    await client.updateUser(appId, "external_id", userId, {
      properties: { tags: tagsPatch },
    });
    return { success: true };
  } catch (error) {
    const code = getErrorCode(error);

    if (code === 404) {
      return { skipped: true, reason: "user_not_found_in_onesignal" };
    }

    if (code !== 409) {
      throw error;
    }

    const isEntitlementConflict = isEntitlementsTagLimitError(error);

    // Tag docs note that adding new tags can fail at per-user tag limits.
    // Fallback: only update existing keys (and deletions) to avoid adding new keys.
    const existingTagKeys = new Set(Object.keys(existingTags));
    const existingOnlyPatch = Object.fromEntries(
      Object.entries(tagsPatch).filter(([key]) => existingTagKeys.has(key)),
    );

    if (!Object.keys(existingOnlyPatch).length) {
      if (isEntitlementConflict) {
        const bootstrapResult = await applyTagsWithEntitlementAwareBootstrap({
          client,
          appId,
          userId,
          tagsPatch,
        });

        if (bootstrapResult.appliedKeys.length > 0) {
          return {
            success: true,
            partial: true,
            reason: "entitlements_tag_limit_partial",
            appliedKeys: bootstrapResult.appliedKeys,
            blockedKey: bootstrapResult.blockedKey,
          };
        }
      }

      return { skipped: true, reason: "conflict_409" };
    }

    await sleep(150);

    try {
      await client.updateUser(appId, "external_id", userId, {
        properties: { tags: existingOnlyPatch },
      });
      return { success: true };
    } catch (retryError) {
      if (getErrorCode(retryError) === 409) {
        return { skipped: true, reason: "conflict_409" };
      }
      throw retryError;
    }
  }
};

