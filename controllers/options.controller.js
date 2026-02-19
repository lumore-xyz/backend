import {
  getOrCreateGlobalOptions,
  updateGlobalOptions,
} from "../services/options.service.js";

export const getPublicOptions = async (req, res) => {
  try {
    const doc = await getOrCreateGlobalOptions();
    return res.status(200).json({
      success: true,
      data: {
        options: doc?.options || {},
        version: doc?.version || null,
        updatedAt: doc?.updatedAt || null,
      },
    });
  } catch (error) {
    console.error("[options] getPublicOptions failed:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch options",
    });
  }
};

export const getPublicOptionsVersion = async (req, res) => {
  try {
    const doc = await getOrCreateGlobalOptions();
    return res.status(200).json({
      success: true,
      data: {
        version: doc?.version || null,
        updatedAt: doc?.updatedAt || null,
      },
    });
  } catch (error) {
    console.error("[options] getPublicOptionsVersion failed:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch options version",
    });
  }
};

export const getAdminOptions = async (req, res) => {
  try {
    const doc = await getOrCreateGlobalOptions();
    return res.status(200).json({
      success: true,
      data: {
        key: doc?.key,
        options: doc?.options || {},
        version: doc?.version || null,
        updatedAt: doc?.updatedAt || null,
        lastUpdatedBy: doc?.lastUpdatedBy || null,
      },
    });
  } catch (error) {
    console.error("[options] getAdminOptions failed:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch admin options",
    });
  }
};

export const patchAdminOptions = async (req, res) => {
  try {
    const optionsPatch = req.body?.options ?? req.body;
    if (!optionsPatch || typeof optionsPatch !== "object" || Array.isArray(optionsPatch)) {
      return res.status(400).json({
        success: false,
        message: "options payload must be an object",
      });
    }

    const updated = await updateGlobalOptions({
      optionsPatch,
      userId: req.user?._id,
    });

    return res.status(200).json({
      success: true,
      message: "Options updated",
      data: {
        key: updated?.key,
        options: updated?.options || {},
        version: updated?.version || null,
        updatedAt: updated?.updatedAt || null,
        lastUpdatedBy: updated?.lastUpdatedBy || null,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update options";
    return res.status(400).json({
      success: false,
      message,
    });
  }
};
