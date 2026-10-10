import CreditLedger from "../models/creditLedger.model.js";
import ExploreDaily from "../models/exploreDaily.model.js";
import AppOptions from "../models/appOptions.model.js";
import LocationRoom from "../models/locationRoom.model.js";
import LocationRoomCycle from "../models/locationRoomCycle.model.js";
import LocationRoomPin from "../models/locationRoomPin.model.js";
import Message from "../models/message.model.js";
import MobileAppVersion from "../models/mobileAppVersion.model.js";
import MobileRuntimeConfig from "../models/mobileRuntimeConfig.model.js";
import Notification from "../models/notification.model.js";
import UserPreference from "../models/preference.model.js";
import { Post } from "../models/post.model.js";
import Push from "../models/push.model.js";
import RejectedProfile from "../models/reject.model.js";
import Report from "../models/report.model.js";
import MatchRoom from "../models/room.model.js";
import ThisOrThatAnswer from "../models/thisOrThatAnswer.model.js";
import ThisOrThatQuestion from "../models/thisOrThatQuestion.model.js";
import UnlockHistory from "../models/unlock.model.js";
import User from "../models/user.model.js";
import UserGroup from "../models/userGroup.model.js";
import UserPhotos from "../models/userPhotos.model.js";
import { logError } from "../utils/logError.js";
import { deleteFile, extractPublicIdFromUrl } from "./file.service.js";
import { deleteMessageMedia } from "./messageMediaCleanup.service.js";
import { disconnectUser } from "./socket.service.js";
import { getAge } from "../utils/age.js";

export const archiveUserAccount = async ({ userId, now = new Date() }) => {
  const scheduledDeletionAt = new Date(now);
  scheduledDeletionAt.setDate(scheduledDeletionAt.getDate() + 30);

  const user = await User.findByIdAndUpdate(
    userId,
    {
      isArchived: true,
      archivedAt: now,
      scheduledDeletionAt,
      isActive: false,
      isMatching: false,
    },
    { returnDocument: "after" },
  );

  if (user) disconnectUser(userId);
  return user ? { user, scheduledDeletionAt } : null;
};

const getTransferAdminId = async (excludeUserId) => {
  const admin = await User.findOne({
    isAdmin: true,
    _id: { $ne: excludeUserId },
  })
    .sort({ createdAt: 1 })
    .select("_id")
    .lean();

  return admin?._id || null;
};

const transferThisOrThatData = async ({ fromUserId, toAdminId }) => {
  await ThisOrThatQuestion.updateMany(
    { submittedBy: fromUserId },
    { $set: { submittedBy: toAdminId } }
  );
};

const getAccountMessageFilter = (userId, roomIdStrings) => ({
  $or: [
    { sender: userId },
    { receiver: userId },
    { roomId: { $in: roomIdStrings } },
  ],
});

const collectAccountMedia = async ({ user, roomIdStrings, userId }) => {
  const [messages, posts, photos] = await Promise.all([
    Message.find(getAccountMessageFilter(userId, roomIdStrings))
      .select("_id messageType imagePublicId imageUrl audioPublicId audioUrl")
      .lean(),
    Post.find({ userId, type: "IMAGE" }).select("content.imageUrls").lean(),
    UserPhotos.find({ user: userId }).select("photoUrl").lean(),
  ]);

  const assets = new Map();
  const addAsset = (publicId, resourceType = "image") => {
    if (publicId) assets.set(`${resourceType}:${publicId}`, { publicId, resourceType });
  };

  addAsset(extractPublicIdFromUrl(user.profilePicture));
  for (const post of posts) addAsset(extractPublicIdFromUrl(post.content?.imageUrls));
  for (const photo of photos) addAsset(extractPublicIdFromUrl(photo.photoUrl));
  return { messages, assets: [...assets.values()] };
};

const deleteAccountMedia = async ({ messages, assets }) => {
  const messageResult = await deleteMessageMedia(messages);
  const results = await Promise.allSettled(assets.map(({ publicId, resourceType }) =>
    deleteFile(publicId, resourceType),
  ));
  const failedAssets = results.filter((result) => result.status === "rejected");
  const messageFailures = messageResult.failedImages + messageResult.failedAudio;
  for (const result of failedAssets) {
    logError("[AccountDeletion] Failed deleting Cloudinary asset", result.reason);
  }
  if (failedAssets.length || messageFailures) {
    throw new Error("ACCOUNT_MEDIA_CLEANUP_FAILED");
  }
};

export const deleteUserAndActivity = async ({ userId }) => {
  const user = await User.findById(userId).select("_id profilePicture").lean();
  if (!user) {
    return { success: false, reason: "USER_NOT_FOUND" };
  }

  const transferAdminId = await getTransferAdminId(userId);
  if (!transferAdminId) {
    return { success: false, reason: "NO_ADMIN_FOR_TRANSFER" };
  }

  const rooms = await MatchRoom.find({ participants: userId }).select("_id").lean();
  const roomIds = rooms.map((room) => room._id);
  const roomIdStrings = roomIds.map((id) => id.toString());

  const media = await collectAccountMedia({ user, roomIdStrings, userId });
  await deleteAccountMedia(media);
  await transferThisOrThatData({
    fromUserId: userId,
    toAdminId: transferAdminId,
  });

  await Promise.all([
    AppOptions.updateMany(
      { lastUpdatedBy: userId },
      { $set: { lastUpdatedBy: null } },
    ),
    LocationRoom.updateMany(
      { creator: userId },
      { $set: { creator: transferAdminId } },
    ),
    LocationRoomPin.updateMany(
      { lastMatchRoom: { $in: roomIds } },
      { $set: { lastMatchRoom: null } },
    ),
    LocationRoomCycle.updateMany(
      {
        $or: [
          { "matches.users": userId },
          { "matches.matchRoom": { $in: roomIds } },
          { "skippedUsers.user": userId },
        ],
      },
      {
        $pull: {
          matches: {
            $or: [
              { users: userId },
              { matchRoom: { $in: roomIds } },
            ],
          },
          skippedUsers: { user: userId },
        },
      },
    ),
    LocationRoomPin.deleteMany({ user: userId }),
    Message.deleteMany(getAccountMessageFilter(userId, roomIdStrings)),
    MatchRoom.deleteMany({ _id: { $in: roomIds } }),
    MobileAppVersion.updateMany(
      { lastUpdatedBy: userId },
      { $set: { lastUpdatedBy: null } },
    ),
    MobileRuntimeConfig.updateMany(
      { lastUpdatedBy: userId },
      { $set: { lastUpdatedBy: null } },
    ),
    Notification.deleteMany({ userId }),
    Notification.deleteMany({
      entityType: "match",
      entityId: { $in: roomIdStrings },
    }),
    Notification.updateMany(
      { actorId: userId },
      { $set: { actorId: null } },
    ),
    Post.deleteMany({ userId }),
    ThisOrThatAnswer.deleteMany({ userId }),
    UserPhotos.deleteMany({ user: userId }),
    UserPreference.deleteMany({ user: userId }),
    User.updateMany(
      { referredBy: userId },
      { $set: { referredBy: null } },
    ),
    UserGroup.updateMany({ members: userId }, { $pull: { members: userId } }),
    UserGroup.updateMany(
      { createdBy: userId },
      { $set: { createdBy: null } },
    ),
    UserGroup.updateMany(
      { updatedBy: userId },
      { $set: { updatedBy: null } },
    ),
    UnlockHistory.deleteMany({
      $or: [{ user: userId }, { unlockedUser: userId }],
    }),
    RejectedProfile.deleteMany({
      $or: [
        { user: userId },
        { rejectedUser: userId },
        { roomId: { $in: roomIds } },
      ],
    }),
    Report.deleteMany({
      $or: [
        { reporter: userId },
        { reportedUser: userId },
        { roomId: { $in: roomIds } },
      ],
    }),
    Push.deleteMany({ user: userId }),
    CreditLedger.deleteMany({ user: userId }),
    ExploreDaily.deleteMany({ user: userId }),
    ExploreDaily.updateMany(
      { $or: [{ "profiles.user": userId }, { "pendingRefresh.profiles.user": userId }] },
      {
        $pull: {
          profiles: { user: userId },
          "pendingRefresh.profiles": { user: userId },
        },
      },
    ),
  ]);

  await User.deleteOne({ _id: userId });

  return {
    success: true,
    transferAdminId: transferAdminId.toString(),
  };
};

export const deleteScheduledAccounts = async ({ now = new Date() } = {}) => {
  const users = await User.find({
    isArchived: true,
    scheduledDeletionAt: { $lte: now },
  }).select("_id").lean();

  const results = [];
  for (const { _id: userId } of users) {
    try {
      const result = await deleteUserAndActivity({ userId });
      results.push({ userId, ...result });
    } catch (error) {
      logError("Scheduled account deletion failed", error);
      results.push({ userId, success: false, reason: "DELETE_FAILED" });
    }
  }

  return results;
};

export const deleteUnderageAccounts = async ({ now = new Date(), execute = false } = {}) => {
  const users = await User.find({ dob: { $type: "date" } }).select("_id dob isAdmin").lean();
  const underage = users.filter(({ dob, isAdmin }) => !isAdmin && getAge(dob, now) < 18);
  if (!execute) return { matched: underage.length, deleted: 0, dryRun: true };

  const results = [];
  for (const { _id: userId } of underage) {
    try {
      results.push({ userId, ...(await deleteUserAndActivity({ userId })) });
    } catch (error) {
      logError("Underage account deletion failed", error);
      results.push({ userId, success: false, reason: "DELETE_FAILED" });
    }
  }
  return {
    matched: underage.length,
    deleted: results.filter(({ success }) => success).length,
    failed: results.filter(({ success }) => !success),
    dryRun: false,
  };
};
