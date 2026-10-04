import {
  getDailyExplore,
  forceRefreshDailyExplore,
  unlockDailyExplore,
} from "../services/explore.service.js";
import { getProfileCompatibility } from "../services/exploreCompatibility.service.js";
import { rejectExploreProfile } from "../services/exploreRejection.service.js";
import { startExploreConversationAndNotify } from "../services/exploreConversation.service.js";
import { logError } from "../utils/logError.js";
import { EXPLORE_DAILY_STATUS } from "../utils/exploreDaily.js";

const respond = async (req, res, operation) => {
  try {
    const data = await operation({ userId: req.user.id });
    const isGenerating = data.status === EXPLORE_DAILY_STATUS.GENERATING;
    if (isGenerating) res.set("Retry-After", "3");
    return res.status(isGenerating ? 202 : 200).json({ success: true, data });
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) logError("[explore] request_failed", error);
    return res.status(status).json({ success: false, code: error.code || "EXPLORE_ERROR",
      message: status >= 500 ? "Explore is temporarily unavailable; retry" : error.message });
  }
};

export const getExplore = (req, res) => respond(req, res, getDailyExplore);
export const getCompatibility = (req, res) => respond(req, res, ({ userId }) =>
  getProfileCompatibility({ userId, profileId: req.params.profileId }));
export const unlockExplore = (req, res) => respond(req, res, unlockDailyExplore);
export const refreshExplore = (req, res) => respond(req, res, ({ userId }) => {
  const requestId = String(req.body?.requestId || "").trim();
  if (!requestId || requestId.length > 80) {
    throw Object.assign(new Error("A valid refresh request ID is required"), {
      statusCode: 400,
      code: "INVALID_REFRESH_REQUEST",
    });
  }
  return forceRefreshDailyExplore({ userId, requestId });
});
export const startConversation = (req, res) => respond(req, res, ({ userId }) =>
  startExploreConversationAndNotify({ userId, profileId: req.params.profileId }),
);
export const rejectProfile = (req, res) => respond(req, res, ({ userId }) =>
  rejectExploreProfile({
    userId,
    profileId: req.params.profileId,
    reason: req.body?.reason,
    feedback: req.body?.feedback,
  }));
