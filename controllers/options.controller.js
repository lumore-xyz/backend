import {
  getOrCreateGlobalOptions,
  updateGlobalOptions,
} from "../services/options.service.js";

export const getPublicOptions = async (req, res) => {
  const doc = await getOrCreateGlobalOptions();
  return res.status(200).json({
    success: true,
    data: {
      options: doc?.options || {},
      version: doc?.version || null,
      updatedAt: doc?.updatedAt || null,
    },
  });
};

export const getPublicOptionsVersion = async (req, res) => {
  const doc = await getOrCreateGlobalOptions();
  return res.status(200).json({
    success: true,
    data: {
      version: doc?.version || null,
      updatedAt: doc?.updatedAt || null,
    },
  });
};

export const getAdminOptions = async (req, res) => {
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
    if (error.statusCode === 400) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    throw error;
  }
};
