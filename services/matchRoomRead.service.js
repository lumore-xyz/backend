import MatchRoom from "../models/room.model.js";
import { isRoomParticipant } from "../utils/matchRoom.js";
import { idsEqual } from "../utils/objectId.js";
import User from "../models/user.model.js";
import { escapeRegex } from "../utils/regex.js";
import { getPagination, hasMorePages } from "../utils/pagination.js";

const getUnreadCount = (unreadCounts, userId) => {
  if (!unreadCounts) return 0;
  if (typeof unreadCounts.get === "function") return Number(unreadCounts.get(userId) || 0);

  if (typeof unreadCounts === "object") {
    for (const [key, value] of Object.entries(unreadCounts)) {
      if (idsEqual(key, userId)) return Number(value || 0);
    }
  }
  return 0;
};

const normalizeLastMessage = (message) =>
  message ? { ...message, message: message.message || null } : null;

const getSortSpec = (sort) => {
  if (sort === "oldest") return { lastMessageAt: 1, _id: 1 };
  if (sort === "compatibility_asc") {
    return { "matchingNote.totalScore": 1, lastMessageAt: -1, _id: -1 };
  }
  if (sort === "compatibility_desc") {
    return { "matchingNote.totalScore": -1, lastMessageAt: -1, _id: -1 };
  }
  if (sort === "nearest") {
    return { "matchingNote.distanceKm": 1, lastMessageAt: -1, _id: -1 };
  }
  if (sort === "farthest") {
    return { "matchingNote.distanceKm": -1, lastMessageAt: -1, _id: -1 };
  }
  return { lastMessageAt: -1, _id: -1 };
};

export const getMatchRoomInbox = async ({ userId, query }) => {
  const currentUserId = userId.toString();
  const requestedSort = String(query.sort || "recent");
  const sort = [
    "recent",
    "oldest",
    "compatibility_desc",
    "compatibility_asc",
    "nearest",
    "farthest",
  ].includes(requestedSort)
    ? requestedSort
    : "recent";
  const hasPagination = query.page !== undefined || query.limit !== undefined;
  const { page, limit } = getPagination(query, {
    defaultLimit: 20,
    maxLimit: 50,
  });
  const filter = {
    participants: userId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.source ? { source: query.source } : {}),
    ...(query.locationRoom ? { locationRoom: query.locationRoom } : {}),
  };

  const search = String(query.search || "").trim();
  if (search) {
    const escapedSearch = escapeRegex(search);
    const matchingUsers = await User.find({
      $or: [
        { nickname: { $regex: escapedSearch, $options: "i" } },
        { username: { $regex: escapedSearch, $options: "i" } },
      ],
    })
      .select("_id")
      .limit(1000)
      .lean();
    filter.participants = {
      $all: [userId],
      $in: matchingUsers.map(({ _id }) => _id),
    };
  }
  if (String(query.unreadOnly || "") === "true") {
    filter[`unreadCounts.${currentUserId}`] = { $gt: 0 };
  }

  const skip = (page - 1) * limit;
  let roomsQuery = MatchRoom.find(filter).sort(getSortSpec(sort));
  if (hasPagination) roomsQuery = roomsQuery.skip(skip).limit(limit);

  const [rooms, total] = await Promise.all([
    roomsQuery
      .populate("participants", "_id username nickname profilePicture")
      .populate("locationRoom", "_id title location")
      .lean(),
    hasPagination ? MatchRoom.countDocuments(filter) : Promise.resolve(0),
  ]);

  const data = rooms.map((room) => ({
    ...room,
    lastMessage: normalizeLastMessage(room.lastMessage),
    unreadCount: getUnreadCount(room.unreadCounts, currentUserId),
  }));

  return {
    data,
    pagination: hasPagination
      ? {
          page,
          limit,
          total,
          hasMore: hasMorePages({ page, limit, total, itemCount: data.length }),
        }
      : null,
  };
};

export const getMatchRoomForUser = async ({ roomId, userId }) => {
  const room = await MatchRoom.findById(roomId)
    .populate("participants", "_id username nickname profilePicture")
    .populate("locationRoom", "_id title location")
    .lean();

  if (!room) return { error: "ROOM_NOT_FOUND" };
  if (!isRoomParticipant(room, userId)) {
    return { error: "FORBIDDEN" };
  }

  const previewType =
    room.lastMessage?.previewType ||
    (room.lastMessage?.messageType === "image"
      ? "image"
      : room.lastMessage?.messageType === "audio"
        ? "audio"
        : "none");
  if (room.lastMessage && previewType === "text") {
    room.lastMessage.message = room.lastMessage.message || null;
  }
  return { room };
};
