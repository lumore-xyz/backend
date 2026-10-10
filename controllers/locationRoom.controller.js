import {
  buildCanonicalLocation,
  getGeoPointFromLocation,
  parseCoordinate,
} from "../utils/location.js";
import { isVerifiedUser } from "../utils/verification.js";
import {
  LOCATION_ROOM_VISIBILITY,
  LOCATION_ROOM_VISIBILITY_VALUES,
  LOCATION_ROOM_TYPE,
  LOCATION_ROOM_TYPE_VALUES,
  LOCATION_ROOM_TAG_LIMIT,
  normalizeLocationRoomTags,
} from "../utils/locationRoom.js";
import { getManageableActiveLocationRoom } from "../services/locationRoomAccess.service.js";
import { processDueLocationRoomCycle } from "../services/locationRoomScheduler.service.js";
import {
  getLocationRoomDetail as loadLocationRoomDetail,
  getNearbyLocationRooms as loadNearbyLocationRooms,
} from "../services/locationRoomRead.service.js";
import {
  createLocationRoomRecord,
  updateLocationRoomRecord,
} from "../services/locationRoomWrite.service.js";
import { logError } from "../utils/logError.js";

const DEFAULT_NEARBY_RADIUS_KM = 25;
const MAX_NEARBY_RADIUS_KM = 100;
const ROOM_VISIBILITY_SET = new Set(LOCATION_ROOM_VISIBILITY_VALUES);

const parseRadiusKm = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_NEARBY_RADIUS_KM;
  return Math.min(parsed, MAX_NEARBY_RADIUS_KM);
};

const getRequestPoint = (req) => {
  const latitude = parseCoordinate(req.query?.latitude ?? req.body?.latitude);
  const longitude = parseCoordinate(req.query?.longitude ?? req.body?.longitude);
  if (latitude !== null && longitude !== null) return { latitude, longitude };
  return getGeoPointFromLocation(req.user?.location);
};

const getRequestedVisibility = (body = {}) => {
  const rawVisibility = body.visibility ?? body.status;
  if (rawVisibility === undefined || rawVisibility === null || rawVisibility === "") {
    return LOCATION_ROOM_VISIBILITY.PUBLIC;
  }

  const visibility = String(rawVisibility).trim().toLowerCase();
  return ROOM_VISIBILITY_SET.has(visibility) ? visibility : null;
};

export const createLocationRoom = async (req, res) => {
  if (!isVerifiedUser(req.user)) {
    return res.status(403).json({ message: "Verification is required to create rooms" });
  }

  const title = String(req.body?.title || "").trim();
  const description = String(req.body?.description || "").trim();
  const tags = normalizeLocationRoomTags(req.body?.tags);
  const visibility = getRequestedVisibility(req.body);
  const type = String(req.body?.type || LOCATION_ROOM_TYPE.LOCAL).trim().toLowerCase();
  if (title.length < 3 || title.length > 80) {
    return res.status(400).json({ message: "title must be 3-80 characters" });
  }
  if (description.length > 500) {
    return res.status(400).json({ message: "description must be 500 characters or less" });
  }
  if (!visibility) {
    return res.status(400).json({
      message: `visibility must be ${LOCATION_ROOM_VISIBILITY_VALUES.join(" or ")}`,
    });
  }
  if (tags === null) {
    return res.status(400).json({ message: `tags must be an array of up to ${LOCATION_ROOM_TAG_LIMIT} tags, each 24 characters or less` });
  }
  if (!LOCATION_ROOM_TYPE_VALUES.includes(type)) {
    return res.status(400).json({ message: `type must be ${LOCATION_ROOM_TYPE_VALUES.join(" or ")}` });
  }

  const point = type === LOCATION_ROOM_TYPE.LOCAL ? getRequestPoint(req) : null;
  if (type === LOCATION_ROOM_TYPE.LOCAL && !point) {
    return res.status(400).json({ message: "latitude and longitude are required" });
  }

  let location = undefined;
  if (point) {
    try {
      location = buildCanonicalLocation({
        latitude: point.latitude,
        longitude: point.longitude,
        formattedAddress: req.body?.formattedAddress || "",
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  }

  try {
    const result = await createLocationRoomRecord({
      title,
      description,
      tags,
      visibility,
      type,
      location,
      userId: req.user._id,
      imageBuffer: req.file?.buffer,
    });
    return res.status(201).json(result);
  } catch (error) {
    if (!error.locationRoomImageUpload) throw error;
    logError("Location room image upload failed", error);
    return res.status(500).json({ message: "Failed to upload room image" });
  }
};

export const updateLocationRoom = async (req, res) => {
  const result = await getManageableActiveLocationRoom({
    roomId: req.params.roomId,
    user: req.user,
  });
  if (result.error === "ROOM_NOT_FOUND") {
    return res.status(404).json({ message: "Room not found" });
  }
  if (result.error === "FORBIDDEN") {
    return res.status(403).json({
      message: "Only the room creator or an admin can edit this room",
    });
  }
  const { room } = result;

  const hasTitle = Object.hasOwn(req.body || {}, "title");
  const hasDescription = Object.hasOwn(req.body || {}, "description");
  const hasTags = Object.hasOwn(req.body || {}, "tags");
  if (!hasTitle && !hasDescription && !hasTags) {
    return res.status(400).json({ message: "title, description, or tags is required" });
  }

  const title = hasTitle ? String(req.body?.title || "").trim() : room.title;
  const description = hasDescription
    ? String(req.body?.description || "").trim()
    : String(room.description || "");
  const tags = hasTags ? normalizeLocationRoomTags(req.body?.tags) : room.tags || [];

  if (title.length < 3 || title.length > 80) {
    return res.status(400).json({ message: "title must be 3-80 characters" });
  }
  if (description.length > 500) {
    return res.status(400).json({ message: "description must be 500 characters or less" });
  }
  if (tags === null) {
    return res.status(400).json({ message: `tags must be an array of up to ${LOCATION_ROOM_TAG_LIMIT} tags, each 24 characters or less` });
  }

  try {
    const result = await updateLocationRoomRecord({
      room,
      title,
      description,
      tags,
      userId: req.user._id,
      imageBuffer: req.file?.buffer,
    });
    if (!result) return res.status(404).json({ message: "Room not found" });
    return res.status(200).json(result);
  } catch (error) {
    if (!error.locationRoomImageUpload) throw error;
    logError("Location room image update upload failed", error);
    return res.status(500).json({ message: "Failed to upload room image" });
  }
};

export const getNearbyLocationRooms = async (req, res) => {
  const point = getRequestPoint(req);
  const sort = String(req.query?.sort || "pool_high");
  const type = String(req.query?.type || "all");
  const nearbyOnly = req.query?.nearby === "true";
  const joinedOnly = req.query?.joinedOnly === "true";
  const inPoolOnly = req.query?.inPoolOnly === "true";
  const search = String(req.query?.search || "").trim().slice(0, 100);
  const page = Math.max(0, Math.min(10000, Number.parseInt(req.query?.page, 10) || 0));
  const limit = Math.max(1, Math.min(30, Number.parseInt(req.query?.limit, 10) || 20));
  if (!["pool_high", "pool_low", "newest", "nearest"].includes(sort)) {
    return res.status(400).json({ message: "Invalid community sort" });
  }
  if (!["all", "local", "topic"].includes(type)) {
    return res.status(400).json({ message: "Invalid community type filter" });
  }
  if ((nearbyOnly || sort === "nearest") && !point) {
    return res.status(400).json({ message: "Location is required for nearby communities" });
  }
  let location = null;
  try {
    if (point) location = buildCanonicalLocation({ latitude: point.latitude, longitude: point.longitude });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }

  return res.status(200).json({
    ...await loadNearbyLocationRooms({
      location,
      userId: req.user._id,
      radiusKm: parseRadiusKm(req.query?.radiusKm),
      page,
      limit,
      search,
      sort,
      type,
      nearbyOnly,
      joinedOnly,
      inPoolOnly,
    }),
  });
};

export const getLocationRoomDetail = async (req, res) => {
  const detail = await loadLocationRoomDetail({
    roomId: req.params.roomId,
    userId: req.user._id,
  });
  if (!detail) return res.status(404).json({ message: "Room not found" });
  return res.status(200).json(detail);
};

export const createStartLocationRoomMatchNow = ({
  processCycle = processDueLocationRoomCycle,
} = {}) => async (req, res) => {
  const result = await getManageableActiveLocationRoom({
    roomId: req.params.roomId,
    user: req.user,
  });
  if (result.error === "ROOM_NOT_FOUND") {
    return res.status(404).json({ message: "Room not found" });
  }
  if (result.error === "FORBIDDEN") {
    return res.status(403).json({
      message: "Only the room creator or an admin can start matching early",
    });
  }
  const { room } = result;

  try {
    const result = await processCycle({
      roomId: room._id,
      now: new Date(),
      ignoreSchedule: true,
    });
    if (result?.skipped) {
      return res.status(409).json({
        message: "A room match cycle is already running. Please try again shortly.",
      });
    }

    return res.status(200).json({
      roomId: room._id,
      nextMatchAt: result?.cycle?.nextMatchAt || null,
      matchCount: result?.matchCount || 0,
      matchedUserCount: result?.matchedUserCount || 0,
      skippedUserCount: result?.skippedUserCount || 0,
    });
  } catch (error) {
    logError("Starting location room match failed", error);
    return res.status(500).json({ message: "Failed to start room matching" });
  }
};

export const startLocationRoomMatchNow = createStartLocationRoomMatchNow();
