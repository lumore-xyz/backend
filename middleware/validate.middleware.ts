import { Types } from "mongoose";

const VISIBILITIES = ["public", "unlocked", "private"];
const POST_TYPES = ["PROMPT", "IMAGE", "TEXT"];

const parseMaybeJson = (value) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

export const validateObjectIdParam = (paramName) => (req, res, next) => {
  const value = req.params?.[paramName];
  if (!value || !Types.ObjectId.isValid(value)) {
    return res.status(400).json({ message: `Invalid ${paramName}` });
  }
  next();
};

export const validateCreatePost = (req, res, next) => {
  const { type, visibility } = req.body;

  if (!POST_TYPES.includes(type)) {
    return res.status(400).json({ message: "Invalid post type" });
  }

  if (visibility && !VISIBILITIES.includes(visibility)) {
    return res.status(400).json({ message: "Invalid visibility value" });
  }

  if (req.body.content !== undefined) {
    const parsed = parseMaybeJson(req.body.content);
    if (typeof parsed !== "object" || parsed === null) {
      return res.status(400).json({ message: "Invalid content payload" });
    }

    if (type === "PROMPT" && parsed.promptId) {
      if (!Types.ObjectId.isValid(parsed.promptId)) {
        return res.status(400).json({ message: "Invalid promptId" });
      }
    }

    if (type === "TEXT" && parsed.text && typeof parsed.text !== "string") {
      return res.status(400).json({ message: "Invalid text content" });
    }

    req.body.content = parsed;
  }

  next();
};

export const validateUpdatePost = (req, res, next) => {
  const { visibility } = req.body;

  if (visibility && !VISIBILITIES.includes(visibility)) {
    return res.status(400).json({ message: "Invalid visibility value" });
  }

  if (req.body.content !== undefined) {
    const parsed = parseMaybeJson(req.body.content);
    if (typeof parsed !== "object" || parsed === null) {
      return res.status(400).json({ message: "Invalid content payload" });
    }
    req.body.content = parsed;
  }

  next();
};

export const validateUpdateLocation = (req, res, next) => {
  const { latitude, longitude } = req.body;
  const latNum = Number(latitude);
  const lonNum = Number(longitude);

  if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
    return res.status(400).json({
      message: "latitude and longitude must be numbers",
    });
  }

  if (latNum < -90 || latNum > 90 || lonNum < -180 || lonNum > 180) {
    return res.status(400).json({
      message: "latitude/longitude out of range",
    });
  }

  req.body.latitude = latNum;
  req.body.longitude = lonNum;
  next();
};
