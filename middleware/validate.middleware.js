import { isValidObjectId } from "../utils/objectId.js";
import { parseCoordinate } from "../utils/location.js";
import { POST_TYPES } from "../utils/post.js";
import { PROFILE_VISIBILITY_VALUES } from "../utils/profileVisibility.js";

const parseMaybeJson = (value) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const validatePostContent = (value) => {
  const content = parseMaybeJson(value);
  if (typeof content !== "object" || content === null || Array.isArray(content)) {
    return { error: "Invalid content payload" };
  }
  if (content.promptId != null && !isValidObjectId(content.promptId)) {
    return { error: "Invalid promptId" };
  }
  return { content };
};

const hasInvalidVisibility = (visibility) =>
  visibility !== undefined && !PROFILE_VISIBILITY_VALUES.includes(visibility);

export const validateObjectIdParam = (paramName) => (req, res, next) => {
  const value = req.params?.[paramName];
  if (!isValidObjectId(value)) {
    return res.status(400).json({ message: `Invalid ${paramName}` });
  }
  next();
};

export const validateCreatePost = (req, res, next) => {
  req.body ||= {};
  const { type, visibility } = req.body;

  if (!POST_TYPES.includes(type)) {
    return res.status(400).json({ message: "Invalid post type" });
  }

  if (hasInvalidVisibility(visibility)) {
    return res.status(400).json({ message: "Invalid visibility value" });
  }

  if (req.body.content !== undefined) {
    const result = validatePostContent(req.body.content);
    if (result.error) return res.status(400).json({ message: result.error });
    const { content } = result;

    if (
      type === "TEXT" &&
      content.text != null &&
      typeof content.text !== "string"
    ) {
      return res.status(400).json({ message: "Invalid text content" });
    }

    req.body.content = content;
  }

  next();
};

export const validateUpdatePost = (req, res, next) => {
  req.body ||= {};
  const { visibility } = req.body;

  if (hasInvalidVisibility(visibility)) {
    return res.status(400).json({ message: "Invalid visibility value" });
  }

  if (req.body.content !== undefined) {
    const result = validatePostContent(req.body.content);
    if (result.error) return res.status(400).json({ message: result.error });
    req.body.content = result.content;
  }

  next();
};

export const validateUpdateLocation = (req, res, next) => {
  req.body ||= {};
  const { latitude, longitude } = req.body;
  const latNum = parseCoordinate(latitude);
  const lonNum = parseCoordinate(longitude);

  if (latNum === null || lonNum === null) {
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
