import {
  createAdminAppVersion,
  deleteAdminAppVersion,
  getActiveAppVersionForPlatform,
  getAdminAppVersionById,
  listAdminAppVersions,
  normalizePlatform,
  sanitizeAdminAppVersion,
  sanitizePublicAppVersion,
  updateAdminAppVersion,
} from "../services/mobileAppVersion.service.js";

const handleError = (error, fallbackMessage) => {
  const message = error instanceof Error ? error.message : fallbackMessage;
  const statusCode = Number(error?.statusCode) || 500;
  return { statusCode, message };
};

export const getPublicAppVersion = async (req, res) => {
  try {
    const { platform } = req.query || {};
    const normalizedPlatform = normalizePlatform(platform);
    const doc = await getActiveAppVersionForPlatform(normalizedPlatform);

    if (!doc) {
      return res.status(200).json({
        success: true,
        data: null,
      });
    }

    return res.status(200).json({
      success: true,
      data: sanitizePublicAppVersion(doc),
    });
  } catch (error) {
    const { statusCode, message } = handleError(error, "Failed to fetch app version");
    return res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

export const listAdminAppVersionsController = async (req, res) => {
  try {
    const docs = await listAdminAppVersions();
    return res.status(200).json({
      success: true,
      data: docs.map((doc) => sanitizeAdminAppVersion(doc)).filter(Boolean),
    });
  } catch (error) {
    const { statusCode, message } = handleError(error, "Failed to list app versions");
    return res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

export const createAdminAppVersionController = async (req, res) => {
  try {
    const created = await createAdminAppVersion({
      payload: req.body,
      userId: req.user?._id,
    });
    return res.status(201).json({
      success: true,
      message: "App version config created",
      data: sanitizeAdminAppVersion(created),
    });
  } catch (error) {
    const { statusCode, message } = handleError(error, "Failed to create app version");
    return res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

export const updateAdminAppVersionController = async (req, res) => {
  try {
    const existing = await getAdminAppVersionById(req.params?.id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "App version config not found",
      });
    }

    const updated = await updateAdminAppVersion({
      id: req.params.id,
      payload: req.body,
      userId: req.user?._id,
    });

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "App version config not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "App version config updated",
      data: sanitizeAdminAppVersion(updated),
    });
  } catch (error) {
    const { statusCode, message } = handleError(error, "Failed to update app version");
    return res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

export const deleteAdminAppVersionController = async (req, res) => {
  try {
    const deleted = await deleteAdminAppVersion(req.params?.id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "App version config not found",
      });
    }
    return res.status(200).json({
      success: true,
      message: "App version config deleted",
      data: { id: deleted._id },
    });
  } catch (error) {
    const { statusCode, message } = handleError(error, "Failed to delete app version");
    return res.status(statusCode).json({
      success: false,
      message,
    });
  }
};