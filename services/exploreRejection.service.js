import ExploreDaily from "../models/exploreDaily.model.js";
import RejectedProfile from "../models/reject.model.js";
import { idsEqual } from "../utils/objectId.js";
import { getUtcDateKey } from "../utils/utcDate.js";
import { EXPLORE_DAILY_STATUS } from "../utils/exploreDaily.js";
import { fail } from "./exploreContext.service.js";

const REJECTION_REASONS = new Set([
  "not_my_type",
  "different_intentions",
  "too_far_away",
  "profile_incomplete",
  "other",
]);

export const rejectExploreProfile = async ({
  userId,
  profileId,
  reason,
  feedback,
  now = new Date(),
}) => {
  if (!REJECTION_REASONS.has(reason)) {
    throw fail("Choose a valid reason for removing this suggestion", 400, "INVALID_REJECTION_REASON");
  }
  if (feedback !== undefined && typeof feedback !== "string") {
    throw fail("Feedback must be text", 400, "INVALID_REJECTION_FEEDBACK");
  }
  const cleanFeedback = feedback?.trim() || "";
  if (cleanFeedback.length > 500) {
    throw fail("Feedback must be 500 characters or fewer", 400, "INVALID_REJECTION_FEEDBACK");
  }

  const daily = await ExploreDaily.findOne({
    user: userId,
    dayKey: getUtcDateKey(now),
    status: EXPLORE_DAILY_STATUS.READY,
  }).lean();
  const selected = daily?.profiles.some((profile) => idsEqual(profile.user, profileId));
  if (!selected) throw fail("Choose a profile from today's unlocked suggestions", 403, "PROFILE_NOT_UNLOCKED");

  await RejectedProfile.findOneAndUpdate(
    { user: userId, rejectedUser: profileId, roomId: null },
    { $set: { reason, feedback: cleanFeedback, timestamp: now } },
    { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
  );
  return { profileId: String(profileId) };
};
