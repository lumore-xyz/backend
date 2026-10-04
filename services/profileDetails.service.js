import User from "../models/user.model.js";
import { triggerOneSignalProfileTagSync } from "./profileTagSync.service.js";
import { applyVerificationAutoRevoke } from "./verificationAutoRevoke.service.js";

const shouldSyncProfileTags = (updateData) =>
  Object.hasOwn(updateData, "nickname") || Object.hasOwn(updateData, "gender");

export const updateUserProfile = async ({ userId, updateData }) => {
  const previousIdentity = await User.findById(userId)
    .select("profilePicture dob gender religion isVerified verificationStatus")
    .lean();

  const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
    returnDocument: "after",
    runValidators: true,
    upsert: false,
  }).select("-password -__v");

  if (!updatedUser) return null;

  const verificationResult = await applyVerificationAutoRevoke({
    userId,
    previousUser: previousIdentity || {},
    nextPatch: updateData,
  });
  if (verificationResult.revocation) {
    Object.assign(updatedUser, verificationResult.revocation);
  }

  await updatedUser.updateLastActive();
  if (shouldSyncProfileTags(updateData)) triggerOneSignalProfileTagSync(updatedUser);
  return updatedUser;
};
