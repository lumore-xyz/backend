/**
 * Auto-revoke verification when a user changes identity-shape fields
 * (profile picture / DOB / gender / religion).
 *
 * Rationale: identity verification (Didit) is bound to the user's
 * submitted selfie + ID at a point in time. If any identity-shape field
 * changes after verification, the previously captured verification no
 * longer corresponds to the current profile, so we must require the
 * user to re-verify.
 *
 * Errors from the DB write are intentionally propagated to the caller so
 * the API can fail loudly — silently dropping the revoke would let a
 * user think they re-verified when they did not.
 */

import User from "../models/user.model.js";

export const IDENTITY_REVOKE_FIELDS = Object.freeze([
  "profilePicture",
  "dob",
  "gender",
  "religion",
]);

const REVOKED_STATUS = "not_started";

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const normalizeForCompare = (value) => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") return value.trim().toLowerCase();
  return value;
};

const valuesAreEqual = (left, right) =>
  normalizeForCompare(left) === normalizeForCompare(right);

export const detectChangedIdentityFields = (previous = {}, next = {}) => {
  const changed = [];
  for (const field of IDENTITY_REVOKE_FIELDS) {
    if (!hasOwn(next, field)) continue;
    if (!valuesAreEqual(previous?.[field], next?.[field])) {
      changed.push(field);
    }
  }
  return changed;
};

const isCurrentlyVerified = (user) =>
  Boolean(user?.isVerified) || user?.verificationStatus === "approved";

const buildRevocationPatch = () => ({
  isVerified: false,
  verificationStatus: REVOKED_STATUS,
  verificationMethod: null,
  verificationSessionId: null,
});

const resolveUserModel = (userModel) => userModel || User;

export const applyVerificationAutoRevoke = async ({
  userId,
  previousUser,
  nextPatch,
  logger = console,
  userModel,
}) => {
  if (!userId || !isPlainObject(previousUser) || !isPlainObject(nextPatch)) {
    return { revoked: false, changedFields: [] };
  }

  const changedFields = detectChangedIdentityFields(previousUser, nextPatch);
  if (changedFields.length === 0) {
    return { revoked: false, changedFields: [] };
  }

  if (!isCurrentlyVerified(previousUser)) {
    return { revoked: false, changedFields, wasVerified: false };
  }

  const revocation = buildRevocationPatch();
  const Model = resolveUserModel(userModel);
  await Model.updateOne({ _id: userId }, { $set: revocation });

  logger?.info?.(
    `[verification-auto-revoke] user=${userId} changedFields=${changedFields.join(
      ",",
    )} status=${REVOKED_STATUS}`,
  );

  return {
    revoked: true,
    changedFields,
    wasVerified: true,
    revocation,
  };
};

export const applyVerificationAutoRevokeForDocument = async ({
  user,
  nextPatch,
  logger = console,
}) => {
  if (!user || !isPlainObject(nextPatch)) {
    return { revoked: false, changedFields: [] };
  }

  const changedFields = detectChangedIdentityFields(
    user.toObject?.() || user,
    nextPatch,
  );
  if (changedFields.length === 0) {
    return { revoked: false, changedFields: [] };
  }

  if (!isCurrentlyVerified(user)) {
    return { revoked: false, changedFields, wasVerified: false };
  }

  user.isVerified = false;
  user.verificationStatus = REVOKED_STATUS;
  user.verificationMethod = null;
  user.verificationSessionId = null;

  logger?.info?.(
    `[verification-auto-revoke] user=${user._id} changedFields=${changedFields.join(
      ",",
    )} status=${REVOKED_STATUS}`,
  );

  return {
    revoked: true,
    changedFields,
    wasVerified: true,
  };
};
