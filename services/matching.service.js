import MatchRoom from "../models/room.model.js";

const MATCH_ROOM_LOG_PREFIX = "[match-room]";

export const BLOCKING_MATCH_STATUSES = ["active", "archive"];

const getId = (value) => value?._id?.toString?.() || value?.toString?.() || "";

export const getPairKey = (userId1, userId2) =>
  [getId(userId1), getId(userId2)].sort().join(":");

const getSortedParticipants = (userId1, userId2) =>
  [getId(userId1), getId(userId2)].sort();

const buildSourceQuery = ({ source, locationRoom, locationRoomCycle }) => {
  if (source === "location_room") {
    return {
      source,
      locationRoom,
      locationRoomCycle,
    };
  }

  return {
    $or: [{ source: "explore" }, { source: { $exists: false } }],
  };
};

const logMatchRoomStep = (stage, details = {}) => {
  console.info(`${MATCH_ROOM_LOG_PREFIX} ${stage}`, details);
};

export const findExistingMatchRoom = async (
  userId1,
  userId2,
  { statuses = BLOCKING_MATCH_STATUSES } = {},
) => {
  const participants = getSortedParticipants(userId1, userId2);
  return await MatchRoom.findOne({
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
  const participants = getSortedParticipants(userId1, userId2);
  const source = options.source || "explore";
  const locationRoom = options.locationRoom || null;
  const locationRoomCycle = options.locationRoomCycle || null;
  const sourceMetadata = options.sourceMetadata || {};

  logMatchRoomStep("lookup_start", {
    userId1: participants[0] || null,
    userId2: participants[1] || null,
    source,
    locationRoom: locationRoom?.toString?.() || locationRoom || null,
    locationRoomCycle:
      locationRoomCycle?.toString?.() || locationRoomCycle || null,
    hasMatchingNote: Boolean(matchingNote),
  });

  try {
    let room = await MatchRoom.findOne({
      participants: { $all: participants },
      $expr: { $eq: [{ $size: "$participants" }, 2] },
      ...buildSourceQuery({ source, locationRoom, locationRoomCycle }),
    });

    if (room) {
      logMatchRoomStep("existing_room_found", {
        roomId: room._id.toString(),
        status: room.status,
      });

      if (room.status !== "active") {
        logMatchRoomStep("existing_room_not_reopened", {
          roomId: room._id.toString(),
          status: room.status,
        });
        return room;
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

      logMatchRoomStep("existing_room_saved", {
        roomId: room._id.toString(),
        status: room.status,
      });
      return room;
    }

    logMatchRoomStep("creating_new_room", {
      participants,
      source,
    });

    room = await MatchRoom.create({
      participants,
      status: "active",
      archivedAt: null,
      source,
      locationRoom,
      locationRoomCycle,
      sourceMetadata,
      matchingNote,
    });

    logMatchRoomStep("new_room_created", {
      roomId: room._id.toString(),
      status: room.status,
    });

    return room;
  } catch (error) {
    console.error(`${MATCH_ROOM_LOG_PREFIX} error`, {
      participants,
      source,
      message: error?.message || "unknown_error",
      stack: error?.stack || null,
    });
    throw error;
  }
};
