import User from "../models/user.model.js";
import { triggerOneSignalProfileTagSync } from "./profileTagSync.service.js";
import { applyVerificationAutoRevoke } from "./verificationAutoRevoke.service.js";
import { getAge } from "../utils/age.js";

const shouldSyncProfileTags = (updateData) =>
  Object.hasOwn(updateData, "nickname") || Object.hasOwn(updateData, "gender");

export const updateUserProfile = async ({ userId, updateData }) => {
  if (Object.hasOwn(updateData, "dob") && getAge(updateData.dob) < 18) {
    throw Object.assign(new Error("You must be 18 or older to use Lumore"), {
      code: "UNDERAGE_ACCOUNT",
    });
  }
  const previousIdentity = await User.findById(userId)
    .select("profilePicture realName dob gender religion isVerified verificationStatus")
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
