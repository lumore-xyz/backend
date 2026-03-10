import {
  getOrCreateMobileRuntimeConfig,
  sanitizePublicRuntimeConfig,
  updateMobileRuntimeConfig,
} from "../services/mobileRuntimeConfig.service.js";

const pickEnvironment = (req) => req.query?.environment || process.env.NODE_ENV;

export const getPublicMobileConfig = async (req, res) => {
  try {
    const doc = await getOrCreateMobileRuntimeConfig({
      environment: pickEnvironment(req),
    });

    return res.status(200).json({
      success: true,
      data: {
        config: sanitizePublicRuntimeConfig(doc?.config || {}),
        version: doc?.version || null,
        updatedAt: doc?.updatedAt || null,
      },
    });
  } catch (error) {
    console.error("[mobile-config] getPublicMobileConfig failed:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch mobile config",
    });
  }
};

export const getAdminMobileConfig = async (req, res) => {
  try {
    const doc = await getOrCreateMobileRuntimeConfig({
      environment: pickEnvironment(req),
    });

    return res.status(200).json({
      success: true,
      data: {
        key: doc?.key || null,
        environment: doc?.environment || null,
        config: sanitizePublicRuntimeConfig(doc?.config || {}),
        version: doc?.version || null,
        updatedAt: doc?.updatedAt || null,
        lastUpdatedBy: doc?.lastUpdatedBy || null,
      },
    });
  } catch (error) {
    console.error("[mobile-config] getAdminMobileConfig failed:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch admin mobile config",
    });
  }
};

export const patchAdminMobileConfig = async (req, res) => {
  try {
    const configPatch = req.body?.config ?? req.body;
    if (!configPatch || typeof configPatch !== "object" || Array.isArray(configPatch)) {
      return res.status(400).json({
        success: false,
        message: "config payload must be an object",
      });
    }

    const updated = await updateMobileRuntimeConfig({
      environment: pickEnvironment(req),
      configPatch,
      userId: req.user?._id,
    });

    return res.status(200).json({
      success: true,
      message: "Mobile config updated",
      data: {
        key: updated?.key || null,
        environment: updated?.environment || null,
        config: sanitizePublicRuntimeConfig(updated?.config || {}),
        version: updated?.version || null,
        updatedAt: updated?.updatedAt || null,
        lastUpdatedBy: updated?.lastUpdatedBy || null,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update mobile config";
    return res.status(400).json({
      success: false,
      message,
    });
  }
};
