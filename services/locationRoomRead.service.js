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
import { isProfileFieldVisible } from "../utils/profileVisibility.js";
import { getActiveLocationRoom } from "./locationRoomAccess.service.js";

const NEARBY_LIMIT = 50;
const NEARBY_RANK_CANDIDATE_LIMIT = 150;
const MEMBER_LIMIT = 100;

const getNearbyRankScore = ({ distanceMeters = 0, poolCount = 0 }) => {
  const distanceKm = Math.max(0, Number(distanceMeters || 0) / 1000);
  const cappedPoolCount = Math.min(Math.max(Number(poolCount || 0), 0), 100);
  const poolBoost = 1 + Math.log2(cappedPoolCount + 1) * 0.35;
  return distanceKm / poolBoost;
};

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

export const getNearbyLocationRooms = async ({ location, userId, radiusKm }) => {
  const [longitude, latitude] = location.coordinates;
  const rooms = await LocationRoom.aggregate([
    {
      $geoNear: {
        near: {
          type: GEOJSON_POINT_TYPE,
          coordinates: [longitude, latitude],
        },
        distanceField: "distanceMeters",
        maxDistance: radiusKm * 1000,
        spherical: true,
        query: {
          status: LOCATION_ROOM_STATUS.ACTIVE,
          ...getPublicNearbyVisibilityQuery(),
        },
      },
    },
    { $sort: { distanceMeters: 1, nextMatchAt: 1 } },
    { $limit: NEARBY_RANK_CANDIDATE_LIMIT },
  ]);
  const countsByRoom = await getLocationRoomCounts(rooms.map((room) => room._id));
  const rankedRooms = rooms
    .map((room) => {
      const counts = countsByRoom.get(room._id.toString()) || { pinnedCount: 0, poolCount: 0 };
      return {
        room,
        counts,
        rankScore: getNearbyRankScore({ distanceMeters: room.distanceMeters, poolCount: counts.poolCount }),
      };
    })
    .sort((first, second) =>
      first.rankScore - second.rankScore ||
      second.counts.poolCount - first.counts.poolCount ||
      (first.room.distanceMeters || 0) - (second.room.distanceMeters || 0),
    )
    .slice(0, NEARBY_LIMIT);
  const pins = await LocationRoomPin.find({
    room: { $in: rankedRooms.map(({ room }) => room._id) },
    user: userId,
  })
    .select("room isPinned inPool poolStatus lastMatchedAt lastMatchRoom lastPoolError")
    .lean();
  const stateByRoom = new Map(pins.map((pin) => [pin.room.toString(), formatPinState(pin)]));

  return rankedRooms.map(({ room, counts }) => ({
    ...formatLocationRoomSummary({ room, counts, distanceMeters: room.distanceMeters }),
    userState: stateByRoom.get(room._id.toString()) || formatPinState(null),
  }));
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
