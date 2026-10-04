import LocationRoom, { LOCATION_ROOM_MATCH_INTERVAL_MS } from "../models/locationRoom.model.js";
import LocationRoomPin from "../models/locationRoomPin.model.js";
import { LOCATION_ROOM_POOL_STATUS } from "../utils/locationRoomPool.js";
import {
  deleteFile,
  extractPublicIdFromUrl,
  uploadImage,
} from "./file.service.js";
import { logError } from "../utils/logError.js";
import {
  getLocationRoomCounts,
  getLocationRoomUserState,
} from "./locationRoomPool.service.js";
import { formatLocationRoomSummary } from "../utils/locationRoom.js";
import { notifyCommunityJoined } from "./notificationPublisher.service.js";

const createImagePublicId = ({ title, userId }) => {
  const safeTitle =
    String(title || "room")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "room";

  return `${userId}-${safeTitle}-${Date.now()}`;
};

const uploadRoomImage = async ({ buffer, title, userId }) => {
  try {
    return await uploadImage({
      buffer,
      folder: "location_rooms",
      publicId: createImagePublicId({ title, userId }),
      maxWidth: 1600,
      maxHeight: 1200,
    });
  } catch (cause) {
    throw Object.assign(new Error(cause?.message || String(cause), { cause }), {
      locationRoomImageUpload: true,
    });
  }
};

const cleanupUploadedImage = async (image, context) => {
  if (!image?.public_id) return;
  await deleteFile(image.public_id).catch((error) => logError(context, error));
};

const formatRoomResult = async (room, userId) => {
  const [countsByRoom, userState] = await Promise.all([
    getLocationRoomCounts(room._id),
    getLocationRoomUserState({ roomId: room._id, userId }),
  ]);
  return {
    room: formatLocationRoomSummary({
      room,
      counts: countsByRoom.get(room._id.toString()),
    }),
    userState,
  };
};

export const createLocationRoomRecord = async ({
  title,
  description,
  visibility,
  location,
  userId,
  imageBuffer,
  now = new Date(),
}) => {
  const uploadedImage = imageBuffer
    ? await uploadRoomImage({ buffer: imageBuffer, title, userId })
    : null;
  let room;
  try {
    room = await LocationRoom.create({
      title,
      description,
      creator: userId,
      visibility,
      imageUrl: uploadedImage?.secure_url || "",
      imagePublicId: uploadedImage?.public_id || "",
      location,
      nextMatchAt: new Date(now.getTime() + LOCATION_ROOM_MATCH_INTERVAL_MS),
    });
  } catch (error) {
    await cleanupUploadedImage(uploadedImage, "Failed to clean up room image after create failure");
    throw error;
  }

  await LocationRoomPin.findOneAndUpdate(
    { room: room._id, user: userId },
    {
      $set: {
        isPinned: true,
        inPool: true,
        poolStatus: LOCATION_ROOM_POOL_STATUS.IN_POOL,
        joinedPoolAt: now,
        lastPoolError: "",
      },
      $setOnInsert: { pinnedAt: now },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );

  notifyCommunityJoined({
    userId,
    communityId: room._id,
    communityName: room.title,
  }).catch((error) => {
    logError("[location-room] community_joined_notification_failed", error);
  });

  return formatRoomResult(room, userId);
};

export const updateLocationRoomRecord = async ({
  room,
  title,
  description,
  userId,
  imageBuffer,
}) => {
  let imageUrl = room.imageUrl || "";
  let imagePublicId = room.imagePublicId || extractPublicIdFromUrl(room.imageUrl) || "";
  let uploadedImage;
  let previousPublicId;

  if (imageBuffer) {
    uploadedImage = await uploadRoomImage({ buffer: imageBuffer, title, userId });
    imageUrl = uploadedImage?.secure_url || "";
    imagePublicId = uploadedImage?.public_id || "";
    previousPublicId = room.imagePublicId || extractPublicIdFromUrl(room.imageUrl);
  }

  let updatedRoom;
  try {
    updatedRoom = await LocationRoom.findByIdAndUpdate(
      room._id,
      { $set: { title, description, imageUrl, imagePublicId } },
      { new: true },
    );
  } catch (error) {
    await cleanupUploadedImage(uploadedImage, "Failed to clean up room image after update failure");
    throw error;
  }

  if (!updatedRoom) {
    await cleanupUploadedImage(uploadedImage, "Failed to clean up unused room image");
    return null;
  }

  if (previousPublicId && previousPublicId !== imagePublicId) {
    await cleanupUploadedImage(
      { public_id: previousPublicId },
      "Failed to delete old location room image",
    );
  }

  return formatRoomResult(updatedRoom, userId);
};
