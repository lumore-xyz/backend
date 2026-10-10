import LocationRoom from "../models/locationRoom.model.js";
import LocationRoomPin from "../models/locationRoomPin.model.js";
import {
  canAccessLocationRoom,
  getLocationRoomCounts,
  getLocationRoomUserState,
} from "./locationRoomPool.service.js";
import {
  formatLocationRoomSummary,
  LOCATION_ROOM_STATUS,
  LOCATION_ROOM_VISIBILITY,
} from "../utils/locationRoom.js";
import { LOCATION_ROOM_POOL_STATUS } from "../utils/locationRoomPool.js";
import { GEOJSON_POINT_TYPE } from "../utils/location.js";
import { LOCATION_ROOM_TYPE } from "../utils/locationRoom.js";
import { isProfileFieldVisible } from "../utils/profileVisibility.js";
import { getActiveLocationRoom } from "./locationRoomAccess.service.js";

const DEFAULT_ROOM_PAGE_SIZE = 20;
const MEMBER_LIMIT = 100;

const safeMemberCard = (user) => ({
  _id: user?._id,
  username: isProfileFieldVisible(user, "username")
    ? user?.username || ""
    : "",
  nickname: isProfileFieldVisible(user, "nickname")
    ? user?.nickname || ""
    : "",
  profilePicture: isProfileFieldVisible(user, "profilePicture")
    ? user?.profilePicture || ""
    : "",
  dob: isProfileFieldVisible(user, "dob") ? user?.dob || null : null,
  gender: isProfileFieldVisible(user, "gender") ? user?.gender || "" : "",
});

const getPublicNearbyVisibilityQuery = () => ({
  $or: [
    { visibility: LOCATION_ROOM_VISIBILITY.PUBLIC },
    { visibility: { $exists: false } },
    { visibility: null },
  ],
});

const formatPinState = (pin) => ({
  isPinned: Boolean(pin?.isPinned),
  inPool: Boolean(
    pin?.inPool && pin?.poolStatus === LOCATION_ROOM_POOL_STATUS.IN_POOL,
  ),
  poolStatus: pin?.poolStatus || LOCATION_ROOM_POOL_STATUS.LEFT,
  lastMatchedAt: pin?.lastMatchedAt || null,
  lastMatchRoom: pin?.lastMatchRoom || null,
  lastPoolError: pin?.lastPoolError || "",
});

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const getNearbyLocationRooms = async ({
  location,
  userId,
  radiusKm,
  page = 0,
  limit = DEFAULT_ROOM_PAGE_SIZE,
  search = "",
  sort = "pool_high",
  type = "all",
  nearbyOnly = false,
  joinedOnly = false,
  inPoolOnly = false,
}) => {
  const [longitude, latitude] = location?.coordinates || [];
  const conditions = [
    { status: LOCATION_ROOM_STATUS.ACTIVE },
    getPublicNearbyVisibilityQuery(),
  ];
  if (type === "topic") conditions.push({ type: LOCATION_ROOM_TYPE.TOPIC });
  if (type === "local" || nearbyOnly || sort === "nearest") {
    conditions.push({ $or: [
      { type: LOCATION_ROOM_TYPE.LOCAL },
      { type: null },
      { type: { $exists: false } },
    ] });
  }
  if (search) {
    const matcher = new RegExp(escapeRegex(search), "i");
    conditions.push({ $or: [{ title: matcher }, { description: matcher }, { tags: matcher }] });
  }
  if (joinedOnly || inPoolOnly) {
    const pins = await LocationRoomPin.find({
      user: userId,
      isPinned: true,
      ...(inPoolOnly ? {
        inPool: true,
        poolStatus: LOCATION_ROOM_POOL_STATUS.IN_POOL,
      } : {}),
    }).select("room").lean();
    conditions.push({ _id: { $in: pins.map((pin) => pin.room) } });
  }
  if (nearbyOnly && sort !== "nearest") {
    conditions.push({ location: { $geoWithin: { $centerSphere: [[longitude, latitude], radiusKm / 6378.1] } } });
  }
  const query = { $and: conditions };
  const offset = page * limit;
  const pageSize = Math.min(30, Math.max(1, limit));
  const totalCountPromise = sort === "nearest"
    ? LocationRoom.aggregate([
      { $geoNear: {
        near: { type: GEOJSON_POINT_TYPE, coordinates: [longitude, latitude] },
        distanceField: "distanceMeters",
        maxDistance: radiusKm * 1000,
        spherical: true,
        query,
      } },
      { $count: "totalCount" },
    ]).then(([result]) => result?.totalCount || 0)
    : LocationRoom.countDocuments(query);
  let roomsPromise;

  if (sort === "nearest") {
    roomsPromise = LocationRoom.aggregate([
      { $geoNear: {
        near: { type: GEOJSON_POINT_TYPE, coordinates: [longitude, latitude] },
        distanceField: "distanceMeters",
        ...(nearbyOnly ? { maxDistance: radiusKm * 1000 } : {}),
        spherical: true,
        query,
      } },
      { $sort: { distanceMeters: 1, _id: 1 } },
      { $skip: offset },
      { $limit: pageSize + 1 },
    ]);
  } else if (sort === "pool_high" || sort === "pool_low") {
    const direction = sort === "pool_high" ? -1 : 1;
    roomsPromise = LocationRoom.aggregate([
      { $match: query },
      { $lookup: {
        from: LocationRoomPin.collection.name,
        let: { roomId: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$room", "$$roomId"] } } },
          { $group: {
            _id: null,
            pinnedCount: { $sum: { $cond: [{ $eq: ["$isPinned", true] }, 1, 0] } },
            poolCount: { $sum: { $cond: [{ $and: [
              { $eq: ["$isPinned", true] },
              { $eq: ["$inPool", true] },
              { $eq: ["$poolStatus", LOCATION_ROOM_POOL_STATUS.IN_POOL] },
            ] }, 1, 0] } },
          } },
        ],
        as: "roomCounts",
      } },
      { $set: {
        poolCount: { $ifNull: [{ $first: "$roomCounts.poolCount" }, 0] },
        pinnedCount: { $ifNull: [{ $first: "$roomCounts.pinnedCount" }, 0] },
      } },
      { $sort: { poolCount: direction, pinnedCount: -1, createdAt: -1, _id: -1 } },
      { $skip: offset },
      { $limit: pageSize + 1 },
    ]);
  } else {
    roomsPromise = LocationRoom.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip(offset)
      .limit(pageSize + 1)
      .lean();
  }

  const [fetchedRooms, totalCount] = await Promise.all([roomsPromise, totalCountPromise]);
  const hasMore = fetchedRooms.length > pageSize;
  const rooms = fetchedRooms.slice(0, pageSize);
  const countsByRoom = await getLocationRoomCounts(rooms.map((room) => room._id));
  const pins = await LocationRoomPin.find({
    room: { $in: rooms.map((room) => room._id) },
    user: userId,
  })
    .select("room isPinned inPool poolStatus lastMatchedAt lastMatchRoom lastPoolError")
    .lean();
  const stateByRoom = new Map(pins.map((pin) => [pin.room.toString(), formatPinState(pin)]));

  return {
    rooms: rooms.map((room) => ({
    ...formatLocationRoomSummary({ room, counts: countsByRoom.get(room._id.toString()), distanceMeters: room.distanceMeters }),
    userState: stateByRoom.get(room._id.toString()) || formatPinState(null),
    })),
    page,
    hasMore,
    totalCount,
  };
};

export const getLocationRoomDetail = async ({ roomId, userId }) => {
  const room = await getActiveLocationRoom({ roomId });
  if (!room || !(await canAccessLocationRoom({ room, userId }))) return null;

  const [countsByRoom, pins, userState] = await Promise.all([
    getLocationRoomCounts(room._id),
    LocationRoomPin.find({
      room: room._id,
      isPinned: true,
      inPool: true,
      poolStatus: LOCATION_ROOM_POOL_STATUS.IN_POOL,
    })
      .populate(
        "user",
        "_id username nickname profilePicture dob gender fieldVisibility",
      )
      .sort({ joinedPoolAt: 1 })
      .limit(MEMBER_LIMIT)
      .lean(),
    getLocationRoomUserState({ roomId: room._id, userId }),
  ]);

  return {
    room: formatLocationRoomSummary({ room, counts: countsByRoom.get(room._id.toString()) }),
    members: pins.map((pin) => pin.user).filter(Boolean).map(safeMemberCard),
    userState,
  };
};
