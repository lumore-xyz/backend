import MatchRoom from "../models/room.model.js";
import { getId, getPairKey, getSortedIds } from "../utils/matchIds.js";
import {
  MATCH_ROOM_SOURCE,
  MATCH_ROOM_STATUSES,
  MATCH_ROOM_STATUS,
} from "../utils/matchRoom.js";

const BLOCKING_MATCH_STATUSES = MATCH_ROOM_STATUSES;

const buildSourceQuery = ({ source, locationRoom, locationRoomCycle }) => {
  if (source === MATCH_ROOM_SOURCE.LOCATION_ROOM) {
    return {
      source,
      locationRoom,
      locationRoomCycle,
    };
  }

  return {
    $or: [
      { source: MATCH_ROOM_SOURCE.EXPLORE },
      { source: { $exists: false } },
    ],
  };
};

export const findExistingMatchRoom = async (
  userId1,
  userId2,
  { statuses = BLOCKING_MATCH_STATUSES } = {},
) => {
  const participants = getSortedIds(userId1, userId2);
  return MatchRoom.findOne({
    participants: { $all: participants },
    $expr: { $eq: [{ $size: "$participants" }, 2] },
    status: { $in: statuses },
  })
    .select("_id participants status")
    .lean();
};

export const hasExistingMatchRoom = async (
  userId1,
  userId2,
  options = {},
) => Boolean(await findExistingMatchRoom(userId1, userId2, options));

export const getMatchedUserIdSet = async ({
  userId,
  statuses = BLOCKING_MATCH_STATUSES,
}) => {
  const currentUserId = getId(userId);
  const rooms = await MatchRoom.find({
    participants: currentUserId,
    status: { $in: statuses },
  })
    .select("participants")
    .lean();

  const matchedUserIds = new Set();
  for (const room of rooms) {
    for (const participantId of room.participants || []) {
      const id = getId(participantId);
      if (id && id !== currentUserId) matchedUserIds.add(id);
    }
  }
  return matchedUserIds;
};

export const getMatchedPairSet = async ({
  userIds = [],
  statuses = BLOCKING_MATCH_STATUSES,
}) => {
  const normalizedUserIds = Array.from(
    new Set((userIds || []).map((userId) => getId(userId)).filter(Boolean)),
  );
  if (!normalizedUserIds.length) return new Set();

  const userIdSet = new Set(normalizedUserIds);
  const rooms = await MatchRoom.find({
    participants: { $in: normalizedUserIds },
    status: { $in: statuses },
  })
    .select("participants")
    .lean();

  const pairSet = new Set();
  for (const room of rooms) {
    if (room.participants?.length !== 2) continue;
    const [userId1, userId2] = room.participants.map((participantId) =>
      getId(participantId),
    );
    if (!userIdSet.has(userId1) || !userIdSet.has(userId2)) continue;
    pairSet.add(getPairKey(userId1, userId2));
  }
  return pairSet;
};

export const getOrCreateMatchRoom = async (
  userId1,
  userId2,
  matchingNote = null,
  options = {},
) => {
  const participants = getSortedIds(userId1, userId2);
  const source = options.source || MATCH_ROOM_SOURCE.EXPLORE;
  const locationRoom = options.locationRoom || null;
  const locationRoomCycle = options.locationRoomCycle || null;
  const sourceMetadata = options.sourceMetadata || {};
  const pairKey = options.pairKey;
  const withCreationStatus = (room, created) =>
    options.returnCreationStatus ? { room, created } : room;

  if (pairKey) await MatchRoom.init();

  let room = await MatchRoom.findOne({
    participants: { $all: participants },
    $expr: { $eq: [{ $size: "$participants" }, 2] },
    ...buildSourceQuery({ source, locationRoom, locationRoomCycle }),
  });

  if (room) {
    if (room.status !== MATCH_ROOM_STATUS.ACTIVE) {
      return withCreationStatus(room, false);
    }
    if (matchingNote) {
      room.matchingNote = matchingNote;
    }
    room.archivedAt = null;
    room.source = source;
    room.locationRoom = locationRoom;
    room.locationRoomCycle = locationRoomCycle;
    room.sourceMetadata = {
      title: sourceMetadata.title || room.sourceMetadata?.title || "",
      subtitle:
        sourceMetadata.subtitle || room.sourceMetadata?.subtitle || "",
    };
    await room.save();

    return withCreationStatus(room, false);
  }

  const roomData = {
    participants,
    status: MATCH_ROOM_STATUS.ACTIVE,
    archivedAt: null,
    source,
    locationRoom,
    locationRoomCycle,
    sourceMetadata,
    matchingNote,
  };
  let created = true;
  if (pairKey) {
    const query = { directExplorePairKey: pairKey };
    try {
      const result = await MatchRoom.findOneAndUpdate(query, { $setOnInsert: roomData },
        { upsert: true, returnDocument: "after", includeResultMetadata: true });
      room = result?.value || result;
      if (result?.lastErrorObject) created = !result.lastErrorObject.updatedExisting;
    } catch (error) {
      if (error.code !== 11000) throw error;
      room = await MatchRoom.findOne(query);
      if (!room) throw error;
      created = false;
    }
  } else {
    room = await MatchRoom.create(roomData);
  }

  return withCreationStatus(room, created);
};
