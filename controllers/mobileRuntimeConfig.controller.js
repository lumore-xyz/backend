import {
  getOrCreateMobileRuntimeConfig,
  sanitizePublicRuntimeConfig,
  updateMobileRuntimeConfig,
} from "../services/mobileRuntimeConfig.service.js";
import { logError } from "../utils/logError.js";

const respondWithServerError = (res, error, action, message) => {
  logError(`[mobile-config] ${action} failed`, error);
  return res.status(500).json({ success: false, message });
};

const toConfigData = (doc, isAdmin = false) => ({
  ...(isAdmin && {
    key: doc?.key || null,
    environment: doc?.environment || null,
  }),
  config: sanitizePublicRuntimeConfig(doc?.config || {}),
  version: doc?.version || null,
  updatedAt: doc?.updatedAt || null,
  ...(isAdmin && { lastUpdatedBy: doc?.lastUpdatedBy || null }),
});

const getMobileConfig = async (req, res, isAdmin) => {
  const action = isAdmin ? "getAdminMobileConfig" : "getPublicMobileConfig";
  const errorMessage = isAdmin
    ? "Failed to fetch admin mobile config"
    : "Failed to fetch mobile config";

  try {
    const doc = await getOrCreateMobileRuntimeConfig({
      environment: req.query?.environment,
    });

    return res.status(200).json({
      success: true,
      data: toConfigData(doc, isAdmin),
    });
  } catch (error) {
    return respondWithServerError(res, error, action, errorMessage);
  }
};

export const getPublicMobileConfig = (req, res) =>
  getMobileConfig(req, res, false);

export const getAdminMobileConfig = (req, res) =>
  getMobileConfig(req, res, true);

export const patchAdminMobileConfig = async (req, res) => {
  try {
    const configPatch = req.body?.config ?? req.body;
    const updated = await updateMobileRuntimeConfig({
      environment: req.query?.environment,
      configPatch,
      userId: req.user?._id,
    });

    return res.status(200).json({
      success: true,
      message: "Mobile config updated",
      data: toConfigData(updated, true),
    });
  } catch (error) {
    if (error?.statusCode !== 400) throw error;
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
