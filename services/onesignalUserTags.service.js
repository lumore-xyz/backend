import * as OneSignal from "@onesignal/node-onesignal";

const ONESIGNAL_APP_ID = String(process.env.ONESIGNAL_APP_ID || "").trim();
const ONESIGNAL_API_KEY = String(process.env.ONESIGNAL_API_KEY || "").trim();

const oneSignalClient =
  ONESIGNAL_APP_ID && ONESIGNAL_API_KEY
    ? new OneSignal.DefaultApi(
        OneSignal.createConfiguration({
          restApiKey: ONESIGNAL_API_KEY,
        }),
      )
    : null;

const PROFILE_TAG_KEYS = ["nickname", "gender", "location.country"];

const DEBUG_LOG_PREFIX = "[OneSignalTagSync][debug]";

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const normalizeText = (value) => String(value || "").trim();

const normalizeDate = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const toTagValue = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (value instanceof Date) return normalizeDate(value);
  return normalizeText(value);
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

export const extractLocationTags = (formattedAddress) => {
  const segments = String(formattedAddress || "")
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (!segments.length) {
    return {
      city: "",
      country: "",
      pincode: "",
    };
  }

  const country = segments.at(-1) || "";
  const pincodeCandidate = segments.at(-2) || "";
  const pincodeMatch = pincodeCandidate.match(/\b\d{4,10}\b/);
  const pincode = pincodeMatch?.[0] || pincodeCandidate;
  const city = segments.at(-4) || segments.at(-3) || "";

  return {
    city: normalizeText(city),
    country: normalizeText(country),
    pincode: normalizeText(pincode),
  };
};

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

const buildErrorSummary = (error) => {
  const body = error?.body || error?.response?.body || null;
  const errors = body?.errors ?? null;
  const reference = body?.reference ?? null;

  return {
    code: getErrorCode(error),
    message: String(error?.message || ""),
    reference: reference ? String(reference) : null,
    errors,
  };
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

const buildPatchSummary = (tagsPatch, existingTags) => {
  const patchKeys = Object.keys(tagsPatch);
  const existingKeySet = new Set(Object.keys(existingTags || {}));
  const addedKeys = [];
  const updatedKeys = [];
  const removedKeys = [];

  for (const key of patchKeys) {
    const value = toTagValue(tagsPatch[key]);
    const exists = existingKeySet.has(key);

    if (value === "") {
      removedKeys.push(key);
      continue;
    }

    if (!exists) {
      addedKeys.push(key);
      continue;
    }

    updatedKeys.push(key);
  }

  return {
    existingTagCount: existingKeySet.size,
    patchCount: patchKeys.length,
    addCount: addedKeys.length,
    updateCount: updatedKeys.length,
    removeCount: removedKeys.length,
    addedKeys,
    updatedKeys,
    removedKeys,
  };
};

const getPatchKeysByPriority = (patch) =>
  PROFILE_TAG_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(patch, key));

const applyTagsWithEntitlementAwareBootstrap = async ({
  client,
  appId,
  userId,
  tagsPatch,
  firstErrorSummary,
}) => {
  const orderedPatchKeys = getPatchKeysByPriority(tagsPatch);
  const appliedKeys = [];

  console.info(
    `${DEBUG_LOG_PREFIX} entitlements_bootstrap_start user=${userId} details=${JSON.stringify({
      candidateKeys: orderedPatchKeys,
      firstError: firstErrorSummary,
    })}`,
  );

  for (const key of orderedPatchKeys) {
    const singleKeyPatch = { [key]: tagsPatch[key] };

    try {
      await client.updateUser(appId, "external_id", userId, {
        properties: { tags: singleKeyPatch },
      });
      appliedKeys.push(key);
      console.info(
        `${DEBUG_LOG_PREFIX} entitlements_bootstrap_key_applied user=${userId} details=${JSON.stringify({
          key,
          appliedCount: appliedKeys.length,
        })}`,
      );
    } catch (error) {
      const code = getErrorCode(error);
      const errorSummary = buildErrorSummary(error);

      if (code === 409 && isEntitlementsTagLimitError(error)) {
        console.warn(
          `${DEBUG_LOG_PREFIX} entitlements_bootstrap_limit_hit user=${userId} details=${JSON.stringify({
            blockedKey: key,
            appliedKeys,
            error: errorSummary,
          })}`,
        );
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
  const userId = String(user?._id || user?.id || "").trim();
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

    const patchSummary = buildPatchSummary(tagsPatch, existingTags);
    const firstErrorSummary = buildErrorSummary(error);
    const isEntitlementConflict = isEntitlementsTagLimitError(error);
    console.warn(
      `${DEBUG_LOG_PREFIX} conflict_409_first_attempt user=${userId} details=${JSON.stringify({
        ...patchSummary,
        isEntitlementConflict,
        firstError: firstErrorSummary,
      })}`,
    );

    // Tag docs note that adding new tags can fail at per-user tag limits.
    // Fallback: only update existing keys (and deletions) to avoid adding new keys.
    const existingTagKeys = new Set(Object.keys(existingTags));
    const existingOnlyPatch = Object.entries(tagsPatch).reduce((acc, [key, value]) => {
      if (existingTagKeys.has(key)) {
        acc[key] = value;
      }
      return acc;
    }, {});

    if (!Object.keys(existingOnlyPatch).length) {
      if (isEntitlementConflict && patchSummary.addCount > 0) {
        const bootstrapResult = await applyTagsWithEntitlementAwareBootstrap({
          client,
          appId,
          userId,
          tagsPatch,
          firstErrorSummary,
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

      console.warn(
        `${DEBUG_LOG_PREFIX} conflict_409_no_retry_patch user=${userId} details=${JSON.stringify({
          existingTagCount: existingTagKeys.size,
          attemptedPatchKeys: Object.keys(tagsPatch),
          note: "All attempted keys are new and could not be safely retried.",
          firstError: firstErrorSummary,
        })}`,
      );
      return { skipped: true, reason: "conflict_409" };
    }

    console.info(
      `${DEBUG_LOG_PREFIX} conflict_409_retry_existing_only user=${userId} details=${JSON.stringify({
        retryPatchCount: Object.keys(existingOnlyPatch).length,
        retryPatchKeys: Object.keys(existingOnlyPatch),
      })}`,
    );

    await sleep(150);

    try {
      await client.updateUser(appId, "external_id", userId, {
        properties: { tags: existingOnlyPatch },
      });
      console.info(
        `${DEBUG_LOG_PREFIX} conflict_409_retry_succeeded user=${userId} details=${JSON.stringify({
          retryPatchCount: Object.keys(existingOnlyPatch).length,
        })}`,
      );
      return { success: true };
    } catch (retryError) {
      const retryCode = getErrorCode(retryError);
      if (retryCode === 409) {
        const retryErrorSummary = buildErrorSummary(retryError);
        console.warn(
          `${DEBUG_LOG_PREFIX} conflict_409_retry_failed user=${userId} details=${JSON.stringify({
            retryPatchCount: Object.keys(existingOnlyPatch).length,
            retryPatchKeys: Object.keys(existingOnlyPatch),
            firstError: firstErrorSummary,
            retryError: retryErrorSummary,
          })}`,
        );
        return { skipped: true, reason: "conflict_409" };
      }
      throw retryError;
    }
  }
};



