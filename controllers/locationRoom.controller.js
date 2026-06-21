import LocationRoomPin from "../models/locationRoomPin.model.js";
import LocationRoom, {
  LOCATION_ROOM_MATCH_INTERVAL_MS,
  LOCATION_ROOM_VISIBILITY_OPTIONS,
} from "../models/locationRoom.model.js";
import { buildCanonicalLocation, getGeoPointFromLocation } from "../utils/location.js";
import { processDueLocationRoomCycle } from "../services/locationRoomMatching.service.js";
import { notifyCommunityJoined } from "../services/notification.service.js";
import socketService from "../services/socket.service.js";
import {
  deleteFile,
  extractPublicIdFromUrl,
  uploadImage,
} from "../services/file.service.js";

const DEFAULT_NEARBY_RADIUS_KM = 25;
const MAX_NEARBY_RADIUS_KM = 100;
const NEARBY_LIMIT = 50;
const NEARBY_RANK_CANDIDATE_LIMIT = 150;
const MEMBER_LIMIT = 100;
const ROOM_VISIBILITY_SET = new Set(LOCATION_ROOM_VISIBILITY_OPTIONS);

const isVerifiedUser = (user) =>
  Boolean(user?.isVerified || user?.verificationStatus === "approved");

const parseCoordinate = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

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

const getSecondsUntil = (date, now = new Date()) => {
  const timestamp = new Date(date).getTime();
  if (Number.isNaN(timestamp)) return 0;
  return Math.max(0, Math.ceil((timestamp - now.getTime()) / 1000));
};

const getRequestedVisibility = (body = {}) => {
  const rawVisibility = body.visibility ?? body.status;
  if (rawVisibility === undefined || rawVisibility === null || rawVisibility === "") {
    return "public";
  }

  const visibility = String(rawVisibility).trim().toLowerCase();
  return ROOM_VISIBILITY_SET.has(visibility) ? visibility : null;
};

const getRoomVisibility = (room) => room?.visibility || "public";

const getPublicNearbyVisibilityQuery = () => ({
  $or: [
    { visibility: "public" },
    { visibility: { $exists: false } },
    { visibility: null },
  ],
});

const isSameId = (first, second) => first?.toString?.() === second?.toString?.();

const canEditRoom = ({ room, user }) =>
  Boolean(user?.isAdmin || isSameId(room?.creator, user?._id));

const canManuallyStartRoomMatch = ({ room, user }) =>
  Boolean(user?.isAdmin || isSameId(room?.creator, user?._id));

const canAccessRoom = async ({ room, userId }) => {
  if (getRoomVisibility(room) === "public") return true;
  if (isSameId(room.creator, userId)) return true;

  const pin = await LocationRoomPin.exists({
    room: room._id,
    user: userId,
    isPinned: true,
  });
  return Boolean(pin);
};

const createImagePublicId = ({ title, userId }) => {
  const safeTitle =
    String(title || "room")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "room";

  return `${userId}-${safeTitle}-${Date.now()}`;
};

const getNearbyRankScore = ({ distanceMeters = 0, poolCount = 0 }) => {
  const distanceKm = Math.max(0, Number(distanceMeters || 0) / 1000);
  const cappedPoolCount = Math.min(Math.max(Number(poolCount || 0), 0), 100);
  const poolBoost = 1 + Math.log2(cappedPoolCount + 1) * 0.35;
  return distanceKm / poolBoost;
};

const safeMemberCard = (user) => ({
  _id: user?._id,
  username: user?.username || "",
  nickname: user?.nickname || "",
  profilePicture: user?.profilePicture || "",
  dob: user?.dob || null,
  gender: user?.gender || "",
});

const getRoomCounts = async (roomIds) => {
  const ids = (Array.isArray(roomIds) ? roomIds : [roomIds]).filter(Boolean);
  if (!ids.length) return new Map();

  const counts = await LocationRoomPin.aggregate([
    { $match: { room: { $in: ids } } },
    {
      $group: {
        _id: "$room",
        pinnedCount: {
          $sum: { $cond: [{ $eq: ["$isPinned", true] }, 1, 0] },
        },
        poolCount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$isPinned", true] },
                  { $eq: ["$inPool", true] },
                  { $eq: ["$poolStatus", "in_pool"] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  return new Map(
    counts.map((item) => [
      item._id.toString(),
      {
        pinnedCount: item.pinnedCount || 0,
        poolCount: item.poolCount || 0,
      },
    ]),
  );
};

const getUserState = async ({ roomId, userId }) => {
  const pin = await LocationRoomPin.findOne({ room: roomId, user: userId }).lean();
  if (!pin) {
    return {
      isPinned: false,
      inPool: false,
      poolStatus: "left",
      lastMatchedAt: null,
      lastMatchedCycle: null,
      lastMatchRoom: null,
      lastPoolError: "",
    };
  }

  return {
    isPinned: Boolean(pin.isPinned),
    inPool: Boolean(pin.inPool && pin.poolStatus === "in_pool"),
    poolStatus: pin.poolStatus || "left",
    lastMatchedAt: pin.lastMatchedAt || null,
    lastMatchedCycle: pin.lastMatchedCycle || null,
    lastMatchRoom: pin.lastMatchRoom || null,
    lastPoolError: pin.lastPoolError || "",
  };
};

const formatRoomSummary = ({ room, counts, distanceMeters = null }) => ({
  _id: room._id,
  title: room.title,
  description: room.description || "",
  creator: room.creator,
  status: room.status,
  visibility: getRoomVisibility(room),
  imageUrl: room.imageUrl || "",
  location: room.location,
  distanceKm:
    distanceMeters === null || distanceMeters === undefined
      ? null
      : Math.round((Number(distanceMeters) / 1000) * 10) / 10,
  nextMatchAt: room.nextMatchAt,
  secondsUntilNextMatch: getSecondsUntil(room.nextMatchAt),
  pinnedCount: counts?.pinnedCount || 0,
  poolCount: counts?.poolCount || 0,
  createdAt: room.createdAt,
  updatedAt: room.updatedAt,
});

const notifyRoomPoolUpdated = async (roomId) => {
  const pins = await LocationRoomPin.find({ room: roomId, isPinned: true })
    .select("user")
    .lean();
  socketService.emitToUsers(
    pins.map((pin) => pin.user),
    "room_pool_updated",
    { roomId: roomId.toString() },
  );
};

export const createLocationRoom = async (req, res) => {
  if (!isVerifiedUser(req.user)) {
    return res.status(403).json({ message: "Verification is required to create rooms" });
  }

  const title = String(req.body?.title || "").trim();
  const description = String(req.body?.description || "").trim();
  const visibility = getRequestedVisibility(req.body);
  if (title.length < 3 || title.length > 80) {
    return res.status(400).json({ message: "title must be 3-80 characters" });
  }
  if (description.length > 500) {
    return res.status(400).json({ message: "description must be 500 characters or less" });
  }
  if (!visibility) {
    return res.status(400).json({ message: "visibility/status must be public or private" });
  }

  const point = getRequestPoint(req);
  if (!point) {
    return res.status(400).json({ message: "latitude and longitude are required" });
  }

  let location;
  try {
    location = buildCanonicalLocation({
      latitude: point.latitude,
      longitude: point.longitude,
      formattedAddress: req.body?.formattedAddress || "",
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }

  const now = new Date();
  let uploadedImage = null;
  if (req.file?.buffer) {
    try {
      uploadedImage = await uploadImage({
        buffer: req.file.buffer,
        folder: "location_rooms",
        publicId: createImagePublicId({ title, userId: req.user._id }),
        format: "webp",
        maxWidth: 1600,
        maxHeight: 1200,
        optimize: true,
      });
    } catch (error) {
      console.error("Error uploading location room image:", error);
      return res.status(500).json({ message: "Failed to upload room image" });
    }
  }

  const room = await LocationRoom.create({
    title,
    description,
    creator: req.user._id,
    visibility,
    imageUrl: uploadedImage?.secure_url || "",
    imagePublicId: uploadedImage?.public_id || "",
    location,
    nextMatchAt: new Date(now.getTime() + LOCATION_ROOM_MATCH_INTERVAL_MS),
  });

  await LocationRoomPin.findOneAndUpdate(
    { room: room._id, user: req.user._id },
    {
      $set: {
        isPinned: true,
        inPool: true,
        poolStatus: "in_pool",
        joinedPoolAt: now,
        lastPoolError: "",
      },
      $setOnInsert: {
        pinnedAt: now,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );

  const counts = (await getRoomCounts(room._id)).get(room._id.toString());
  notifyCommunityJoined({
    userId: req.user._id,
    communityId: room._id,
    communityName: room.title,
  }).catch((error) => {
    console.error(
      "[location-room] community_joined_notification_failed:",
      error?.message || error,
    );
  });
  return res.status(201).json({
    room: formatRoomSummary({ room, counts }),
    userState: await getUserState({ roomId: room._id, userId: req.user._id }),
  });
};

export const updateLocationRoom = async (req, res) => {
  const room = await LocationRoom.findOne({
    _id: req.params.roomId,
    status: "active",
  }).lean();
  if (!room) {
    return res.status(404).json({ message: "Room not found" });
  }

  if (!canEditRoom({ room, user: req.user })) {
    return res.status(403).json({
      message: "Only the room creator or an admin can edit this room",
    });
  }

  const hasTitle = Object.prototype.hasOwnProperty.call(req.body || {}, "title");
  const hasDescription = Object.prototype.hasOwnProperty.call(
    req.body || {},
    "description",
  );
  if (!hasTitle && !hasDescription) {
    return res.status(400).json({ message: "title or description is required" });
  }

  const title = hasTitle ? String(req.body?.title || "").trim() : room.title;
  const description = hasDescription
    ? String(req.body?.description || "").trim()
    : String(room.description || "");

  if (title.length < 3 || title.length > 80) {
    return res.status(400).json({ message: "title must be 3-80 characters" });
  }
  if (description.length > 500) {
    return res.status(400).json({ message: "description must be 500 characters or less" });
  }

  let nextImageUrl = room.imageUrl || "";
  let nextImagePublicId =
    room.imagePublicId || extractPublicIdFromUrl(room.imageUrl) || "";
  if (req.file?.buffer) {
    try {
      const uploadedImage = await uploadImage({
        buffer: req.file.buffer,
        folder: "location_rooms",
        publicId: createImagePublicId({ title, userId: req.user._id }),
        format: "webp",
        maxWidth: 1600,
        maxHeight: 1200,
        optimize: true,
      });
      nextImageUrl = uploadedImage?.secure_url || "";
      nextImagePublicId = uploadedImage?.public_id || "";
      const previousImagePublicId =
        room.imagePublicId || extractPublicIdFromUrl(room.imageUrl);
      if (
        previousImagePublicId &&
        previousImagePublicId !== nextImagePublicId
      ) {
        deleteFile(previousImagePublicId, "image").catch((error) => {
          console.error("Error deleting old location room image:", error);
        });
      }
    } catch (error) {
      console.error("Error uploading updated location room image:", error);
      return res.status(500).json({ message: "Failed to upload room image" });
    }
  }

  const updatedRoom = await LocationRoom.findByIdAndUpdate(
    room._id,
    {
      $set: {
        title,
        description,
        imageUrl: nextImageUrl,
        imagePublicId: nextImagePublicId,
      },
    },
    { new: true },
  );

  const counts = (await getRoomCounts(updatedRoom._id)).get(updatedRoom._id.toString());
  return res.status(200).json({
    room: formatRoomSummary({ room: updatedRoom, counts }),
    userState: await getUserState({ roomId: updatedRoom._id, userId: req.user._id }),
  });
};

export const getNearbyLocationRooms = async (req, res) => {
  const point = getRequestPoint(req);
  if (!point) {
    return res.status(400).json({ message: "latitude and longitude are required" });
  }

  let location;
  try {
    location = buildCanonicalLocation({
      latitude: point.latitude,
      longitude: point.longitude,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }

  const radiusKm = parseRadiusKm(req.query?.radiusKm);
  const [longitude, latitude] = location.coordinates;
  const rooms = await LocationRoom.aggregate([
    {
      $geoNear: {
        near: { type: "Point", coordinates: [longitude, latitude] },
        distanceField: "distanceMeters",
        maxDistance: radiusKm * 1000,
        spherical: true,
        query: {
          status: "active",
          ...getPublicNearbyVisibilityQuery(),
        },
      },
    },
    { $sort: { distanceMeters: 1, nextMatchAt: 1 } },
    { $limit: NEARBY_RANK_CANDIDATE_LIMIT },
  ]);
  const roomIds = rooms.map((room) => room._id);
  const countsByRoom = await getRoomCounts(roomIds);
  const rankedRooms = rooms
    .map((room) => {
      const counts = countsByRoom.get(room._id.toString()) || {
        pinnedCount: 0,
        poolCount: 0,
      };
      return {
        room,
        counts,
        rankScore: getNearbyRankScore({
          distanceMeters: room.distanceMeters,
          poolCount: counts.poolCount,
        }),
      };
    })
    .sort((first, second) => {
      if (first.rankScore !== second.rankScore) return first.rankScore - second.rankScore;
      if (first.counts.poolCount !== second.counts.poolCount) {
        return second.counts.poolCount - first.counts.poolCount;
      }
      return (first.room.distanceMeters || 0) - (second.room.distanceMeters || 0);
    })
    .slice(0, NEARBY_LIMIT);
  const rankedRoomIds = rankedRooms.map(({ room }) => room._id);
  const pinnedStates = await LocationRoomPin.find({
    room: { $in: rankedRoomIds },
    user: req.user._id,
  })
    .select("room isPinned inPool poolStatus lastMatchedAt lastMatchRoom lastPoolError")
    .lean();
  const stateByRoom = new Map(
    pinnedStates.map((pin) => [
      pin.room.toString(),
      {
        isPinned: Boolean(pin.isPinned),
        inPool: Boolean(pin.inPool && pin.poolStatus === "in_pool"),
        poolStatus: pin.poolStatus || "left",
        lastMatchedAt: pin.lastMatchedAt || null,
        lastMatchRoom: pin.lastMatchRoom || null,
        lastPoolError: pin.lastPoolError || "",
      },
    ]),
  );

  return res.status(200).json({
    rooms: rankedRooms.map(({ room, counts }) => ({
      ...formatRoomSummary({
        room,
        counts,
        distanceMeters: room.distanceMeters,
      }),
      userState:
        stateByRoom.get(room._id.toString()) ||
        {
          isPinned: false,
          inPool: false,
          poolStatus: "left",
          lastMatchedAt: null,
          lastMatchRoom: null,
          lastPoolError: "",
        },
    })),
  });
};

export const getLocationRoomDetail = async (req, res) => {
  const { roomId } = req.params;
  const room = await LocationRoom.findOne({ _id: roomId, status: "active" }).lean();
  if (!room) {
    return res.status(404).json({ message: "Room not found" });
  }
  if (!(await canAccessRoom({ room, userId: req.user._id }))) {
    return res.status(404).json({ message: "Room not found" });
  }

  const counts = (await getRoomCounts(room._id)).get(room._id.toString());
  const pins = await LocationRoomPin.find({
    room: room._id,
    isPinned: true,
    inPool: true,
    poolStatus: "in_pool",
  })
    .populate("user", "_id username nickname profilePicture dob gender")
    .sort({ joinedPoolAt: 1 })
    .limit(MEMBER_LIMIT)
    .lean();

  return res.status(200).json({
    room: formatRoomSummary({ room, counts }),
    members: pins
      .map((pin) => pin.user)
      .filter(Boolean)
      .map(safeMemberCard),
    userState: await getUserState({ roomId: room._id, userId: req.user._id }),
  });
};

const setPinState = async ({ roomId, userId, state }) => {
  const room = await LocationRoom.findOne({ _id: roomId, status: "active" }).lean();
  if (!room) return null;
  if (!(await canAccessRoom({ room, userId }))) return "private";

  const now = new Date();
  const nextState = { ...state };
  if (state.inPool) {
    nextState.joinedPoolAt = now;
  }
  const pin = await LocationRoomPin.findOneAndUpdate(
    { room: roomId, user: userId },
    {
      $set: nextState,
      $setOnInsert: {
        pinnedAt: now,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
  await notifyRoomPoolUpdated(roomId);
  return { room, pin };
};

export const pinLocationRoom = async (req, res) => {
  const result = await setPinState({
    roomId: req.params.roomId,
    userId: req.user._id,
    state: {
      isPinned: true,
      inPool: true,
      poolStatus: "in_pool",
      lastPoolError: "",
    },
  });
  if (!result) return res.status(404).json({ message: "Room not found" });
  if (result === "private") {
    return res.status(403).json({ message: "This room is private" });
  }

  return res.status(200).json({
    userState: await getUserState({ roomId: req.params.roomId, userId: req.user._id }),
  });
};

export const rejoinLocationRoomPool = async (req, res) => {
  const result = await setPinState({
    roomId: req.params.roomId,
    userId: req.user._id,
    state: {
      isPinned: true,
      inPool: true,
      poolStatus: "in_pool",
      lastPoolError: "",
    },
  });
  if (!result) return res.status(404).json({ message: "Room not found" });
  if (result === "private") {
    return res.status(403).json({ message: "This room is private" });
  }

  return res.status(200).json({
    userState: await getUserState({ roomId: req.params.roomId, userId: req.user._id }),
  });
};

export const leaveLocationRoomPool = async (req, res) => {
  const result = await setPinState({
    roomId: req.params.roomId,
    userId: req.user._id,
    state: {
      isPinned: true,
      inPool: false,
      poolStatus: "left",
      lastPoolError: "",
    },
  });
  if (!result) return res.status(404).json({ message: "Room not found" });
  if (result === "private") {
    return res.status(403).json({ message: "This room is private" });
  }

  return res.status(200).json({
    userState: await getUserState({ roomId: req.params.roomId, userId: req.user._id }),
  });
};

export const unpinLocationRoom = async (req, res) => {
  const room = await LocationRoom.findOne({ _id: req.params.roomId, status: "active" }).lean();
  if (!room) return res.status(404).json({ message: "Room not found" });
  if (!(await canAccessRoom({ room, userId: req.user._id }))) {
    return res.status(403).json({ message: "This room is private" });
  }

  await LocationRoomPin.findOneAndUpdate(
    { room: req.params.roomId, user: req.user._id },
    {
      $set: {
        isPinned: false,
        inPool: false,
        poolStatus: "left",
        lastPoolError: "",
      },
      $setOnInsert: {
        pinnedAt: new Date(),
      },
    },
    { upsert: true, setDefaultsOnInsert: true },
  );
  await notifyRoomPoolUpdated(req.params.roomId);

  return res.status(200).json({
    userState: await getUserState({ roomId: req.params.roomId, userId: req.user._id }),
  });
};

export const createStartLocationRoomMatchNow = ({
  processCycle = processDueLocationRoomCycle,
} = {}) => async (req, res) => {
  const room = await LocationRoom.findOne({
    _id: req.params.roomId,
    status: "active",
  }).lean();
  if (!room) {
    return res.status(404).json({ message: "Room not found" });
  }

  if (!canManuallyStartRoomMatch({ room, user: req.user })) {
    return res.status(403).json({
      message: "Only the room creator or an admin can start matching early",
    });
  }

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
    console.error("Error starting location room match early:", error);
    return res.status(500).json({ message: "Failed to start room matching" });
  }
};

export const startLocationRoomMatchNow = createStartLocationRoomMatchNow();
