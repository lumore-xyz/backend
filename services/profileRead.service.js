import UnlockHistory from "../models/unlock.model.js";
import User from "../models/user.model.js";
import UserPhotos from "../models/userPhotos.model.js";
import {
  calculateDistanceMeters,
  getGeoPointFromLocation,
} from "../utils/location.js";
import { idsEqual } from "../utils/objectId.js";
import { isProfileFieldVisible } from "../utils/profileVisibility.js";

const PROFILE_FIELDS = new Set([
  "username",
  "nickname",
  "realName",
  "bloodGroup",
  "dob",
  "gender",
  "height",
  "bio",
  "interests",
  "diet",
  "zodiacSign",
  "lifestyle",
  "work",
  "institution",
  "maritalStatus",
  "religion",
  "hometown",
  "languages",
  "personalityType",
  "profilePicture",
  "isVerified",
]);

const fail = (message, statusCode) =>
  Object.assign(new Error(message), { statusCode });

export const getProfileData = async ({ userId, viewerId }) => {
  if (!userId || !viewerId) throw fail("Invalid request", 400);

  const ownsProfile = idsEqual(userId, viewerId);
  const userPromise = Promise.resolve(
    User.findById(userId).select("-password"),
  );
  const [user, viewer] = await Promise.all([
    userPromise,
    ownsProfile
      ? userPromise
      : User.findById(viewerId).lean().select("location"),
  ]);
  if (!user || user.isArchived) throw fail("User not found", 404);

  const unlocks = ownsProfile
    ? []
    : await UnlockHistory.find({
        $or: [
          { user: userId, unlockedUser: viewerId },
          { user: viewerId, unlockedUser: userId },
        ],
      })
        .select("user")
        .lean();
  const isViewerUnlockedByUser = ownsProfile || unlocks.some((unlock) =>
    idsEqual(unlock.user, userId),
  );
  const isViewerUnlockedUser = ownsProfile || unlocks.some((unlock) =>
    idsEqual(unlock.user, viewerId),
  );
  const photos = ownsProfile || isViewerUnlockedByUser
    ? await UserPhotos.find({ user: userId }).select("photoUrl").lean()
    : null;
  const distanceMeters = isProfileFieldVisible(user, "location")
    ? calculateDistanceMeters(
        getGeoPointFromLocation(viewer.location),
        getGeoPointFromLocation(user.location),
      )
    : null;
  const distance = distanceMeters === null ? null : distanceMeters / 1000;

  if (ownsProfile) {
    return {
      ...user.toJSON({ isUnlocked: true }),
      photos,
      distance,
      isViewerUnlockedByUser: true,
      isViewerUnlockedUser: true,
    };
  }

  const profile = {
    _id: user._id,
    distance,
    isViewerUnlockedByUser,
    isViewerUnlockedUser,
  };
  for (const field of PROFILE_FIELDS) {
    if (
      user[field] !== undefined &&
      isProfileFieldVisible(user, field, isViewerUnlockedByUser)
    ) {
      profile[field] = user[field];
    }
  }

  profile.realName = isProfileFieldVisible(
    user,
    "realName",
    isViewerUnlockedByUser,
  )
    ? user.realName
    : null;
  profile.photos = isViewerUnlockedByUser ? photos : null;
  return profile;
};
