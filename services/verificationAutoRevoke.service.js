/**
 * Auto-revoke verification when a user changes identity-shape fields
 * (profile picture / real name / DOB / gender / religion).
 *
 * Rationale: identity verification (HaloKYC) is bound to the user's
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
import { isPlainObject } from "../utils/object.js";
import { normalizeString } from "../utils/strings.js";
import {
  isVerifiedUser,
  VERIFICATION_STATUS,
} from "../utils/verification.js";
import { notifyVerificationStatusChange } from "./notificationPublisher.service.js";

export const IDENTITY_REVOKE_FIELDS = Object.freeze([
  "profilePicture",
  "realName",
  "dob",
  "gender",
  "religion",
]);

const normalizeForCompare = (value) => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") return normalizeString(value);
  return value;
};
const valuesAreEqual = (left, right) =>
  normalizeForCompare(left) === normalizeForCompare(right);

export const detectChangedIdentityFields = (previous = {}, next = {}) => {
  const changed = [];
  for (const field of IDENTITY_REVOKE_FIELDS) {
    if (!Object.hasOwn(next, field)) continue;
    if (!valuesAreEqual(previous?.[field], next?.[field])) {
      changed.push(field);
    }
  }
  return changed;
};

const buildRevocationPatch = () => ({
  isVerified: false,
  verificationStatus: VERIFICATION_STATUS.NOT_STARTED,
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

  if (!isVerifiedUser(previousUser)) {
    return { revoked: false, changedFields, wasVerified: false };
  }

  const revocation = buildRevocationPatch();
  const Model = resolveUserModel(userModel);
  await Model.updateOne({ _id: userId }, { $set: revocation });

  logger?.info?.(
    `[verification-auto-revoke] user=${userId} changedFields=${changedFields.join(
      ",",
    )} status=${VERIFICATION_STATUS.NOT_STARTED}`,
  );

  await notifyVerificationStatusChange({
    userId,
    status: VERIFICATION_STATUS.NOT_STARTED,
    previousStatus: previousUser?.verificationStatus,
    source: "identity_field_change",
    metadata: { changedFields },
  });

  return {
    revoked: true,
    changedFields,
    wasVerified: true,
    revocation,
  };
};
