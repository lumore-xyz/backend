import { syncUserProfileTagsToOneSignal } from "./onesignalUserTags.service.js";
import { getId } from "../utils/matchIds.js";
import { logError } from "../utils/logError.js";

export const triggerOneSignalProfileTagSync = (user) => {
  const userId = getId(user).trim();
  if (!userId) return;

  void syncUserProfileTagsToOneSignal(user)
    .then((result) => {
      if (!result?.success || !result.partial) return;

      console.warn("[OneSignalTagSync] partial sync", {
        reason: result.reason || "unknown",
        blockedKey: result.blockedKey || null,
      });
    })
    .catch((error) => {
      logError("[OneSignalTagSync] sync_failed", error);
    });
};
