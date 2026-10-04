import { sendNotificationToUser } from "./push.service.js";
import socketService from "./socket.service.js";
import LocationRoomPin from "../models/locationRoomPin.model.js";
import { MATCH_ROOM_STATUS } from "../utils/matchRoom.js";
import { buildCommunityMatchNotification } from "./notification.templates.js";
import { createManyNotifications } from "./notification.service.js";
import { logError } from "../utils/logError.js";

const LOG_PREFIX = "[location-room-notification]";

export const notifyLocationRoomPoolUpdated = async ({ roomId, userIds, ...details }) => {
  const recipients = userIds ?? (await LocationRoomPin.find({ room: roomId, isPinned: true })
    .select("user")
    .lean()).map((pin) => pin.user);
  socketService.emitToUsers(recipients, "room_pool_updated", {
    roomId: roomId.toString(),
    ...details,
  });
};

const buildRoomMatchPayload = ({ room, matchRoom, matchedUserId, matchingNote }) => ({
  roomId: matchRoom._id.toString(),
  chatRoomId: matchRoom._id.toString(),
  matchedUser: matchedUserId.toString(),
  matchedUserId: matchedUserId.toString(),
  locationRoom: { _id: room._id.toString(), title: room.title },
  matchingNote,
});

export const notifyRoomMatch = async ({
  room,
  matchRoom,
  userId1,
  userId2,
  balances,
}) => {
  const roomId = matchRoom._id.toString();
  const notifications = [
    [userId1, userId2],
    [userId2, userId1],
  ].map(([userId, matchedUserId]) => buildCommunityMatchNotification({
    userId,
    matchedUserId,
    roomId: matchRoom._id,
    locationRoomId: room._id,
    communityName: room.title,
  })).filter(Boolean);

  if (notifications.length) {
    createManyNotifications(notifications).catch((error) => {
      logError(`${LOG_PREFIX} notification_create_failed`, error);
    });
  }

  socketService.emitToUser(userId1, "roomMatchFound", buildRoomMatchPayload({
    room, matchRoom, matchedUserId: userId2, matchingNote: matchRoom.matchingNote,
  }));
  socketService.emitToUser(userId2, "roomMatchFound", buildRoomMatchPayload({
    room, matchRoom, matchedUserId: userId1, matchingNote: matchRoom.matchingNote,
  }));
  for (const userId of [userId1, userId2]) {
    socketService.emitToUser(userId, "inbox_updated", {
      roomId,
      status: MATCH_ROOM_STATUS.ACTIVE,
    });
  }
  socketService.emitToUser(userId1, "creditsUpdated", {
    credits: balances?.[userId1.toString()],
    reason: "room_conversation_start",
  });

  await Promise.allSettled([
    [userId1, userId2],
    [userId2, userId1],
  ].map(([userId, matchedUserId]) => sendNotificationToUser(userId, {
    title: "Room match found!",
    body: `You matched through ${room.title}.`,
    tag: `room-match-${roomId}`,
    data: {
      type: "room_match",
      roomId,
      locationRoomId: room._id.toString(),
      matchedUserId: matchedUserId.toString(),
      url: `/app/chat/${roomId}`,
    },
  })));
};
