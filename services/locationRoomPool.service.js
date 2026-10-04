import LocationRoomPin from "../models/locationRoomPin.model.js";
import { idsEqual } from "../utils/objectId.js";
import { LOCATION_ROOM_POOL_STATUS } from "../utils/locationRoomPool.js";
import { LOCATION_ROOM_VISIBILITY } from "../utils/locationRoom.js";
import { getActiveLocationRoom } from "./locationRoomAccess.service.js";
import { notifyLocationRoomPoolUpdated } from "./locationRoomNotification.service.js";

export const getLocationRoomCounts = async (roomIds) => {
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
                  { $eq: ["$poolStatus", LOCATION_ROOM_POOL_STATUS.IN_POOL] },
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
      { pinnedCount: item.pinnedCount || 0, poolCount: item.poolCount || 0 },
    ]),
  );
};

export const canAccessLocationRoom = async ({ room, userId }) => {
  if (
    (room?.visibility || LOCATION_ROOM_VISIBILITY.PUBLIC) ===
    LOCATION_ROOM_VISIBILITY.PUBLIC
  ) {
    return true;
  }
  if (idsEqual(room.creator, userId)) return true;

  return Boolean(
    await LocationRoomPin.exists({
      room: room._id,
      user: userId,
      isPinned: true,
    }),
  );
};

export const getLocationRoomUserState = async ({ roomId, userId }) => {
  const pin = await LocationRoomPin.findOne({ room: roomId, user: userId }).lean();
  if (!pin) {
    return {
      isPinned: false,
      inPool: false,
      poolStatus: LOCATION_ROOM_POOL_STATUS.LEFT,
      lastMatchedAt: null,
      lastMatchedCycle: null,
      lastMatchRoom: null,
      lastPoolError: "",
    };
  }

  return {
    isPinned: Boolean(pin.isPinned),
    inPool: Boolean(
      pin.inPool && pin.poolStatus === LOCATION_ROOM_POOL_STATUS.IN_POOL,
    ),
    poolStatus: pin.poolStatus || LOCATION_ROOM_POOL_STATUS.LEFT,
    lastMatchedAt: pin.lastMatchedAt || null,
    lastMatchedCycle: pin.lastMatchedCycle || null,
    lastMatchRoom: pin.lastMatchRoom || null,
    lastPoolError: pin.lastPoolError || "",
  };
};

export const updateLocationRoomPool = async ({ roomId, userId, state }) => {
  const room = await getActiveLocationRoom({ roomId });
  if (!room) return null;
  if (!(await canAccessLocationRoom({ room, userId }))) {
    return LOCATION_ROOM_VISIBILITY.PRIVATE;
  }

  const now = new Date();
  const nextState = {
    ...state,
    ...(state.inPool ? { joinedPoolAt: now } : {}),
  };
  await LocationRoomPin.findOneAndUpdate(
    { room: roomId, user: userId },
    {
      $set: nextState,
      $setOnInsert: { pinnedAt: now },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
  await notifyLocationRoomPoolUpdated({ roomId });
  return room;
};

export const unpinLocationRoom = async ({ roomId, userId }) => {
  const room = await getActiveLocationRoom({ roomId });
  if (!room) return { error: "ROOM_NOT_FOUND" };
  if (!(await canAccessLocationRoom({ room, userId }))) {
    return { error: "PRIVATE_ROOM" };
  }

  await LocationRoomPin.findOneAndUpdate(
    { room: roomId, user: userId },
    {
      $set: {
        isPinned: false,
        inPool: false,
        poolStatus: LOCATION_ROOM_POOL_STATUS.LEFT,
        lastPoolError: "",
      },
      $setOnInsert: { pinnedAt: new Date() },
    },
    { upsert: true, setDefaultsOnInsert: true },
  );
  await notifyLocationRoomPoolUpdated({ roomId });
  return { userState: await getLocationRoomUserState({ roomId, userId }) };
};

