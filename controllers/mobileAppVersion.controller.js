import {
  createAdminAppVersion,
  deleteAdminAppVersion,
  getActiveAppVersionForPlatform,
  listAdminAppVersions,
  normalizePlatform,
  sanitizeAdminAppVersion,
  sanitizePublicAppVersion,
  updateAdminAppVersion,
} from "../services/mobileAppVersion.service.js";
import { logError } from "../utils/logError.js";

const respondWithError = (res, error, fallbackMessage) => {
  const statusCode = Number(error?.statusCode) || 500;
  const message = statusCode >= 500
    ? fallbackMessage
    : error instanceof Error
      ? error.message
      : fallbackMessage;

  if (statusCode >= 500) logError("App version request failed", error);
  return res.status(statusCode).json({ success: false, message });
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
    return respondWithError(res, error, "Failed to fetch app version");
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
    return respondWithError(res, error, "Failed to list app versions");
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
    return respondWithError(res, error, "Failed to create app version");
  }
};

export const updateAdminAppVersionController = async (req, res) => {
  try {
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
    return respondWithError(res, error, "Failed to update app version");
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
    return respondWithError(res, error, "Failed to delete app version");
  }
};
