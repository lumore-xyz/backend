import User from "../models/user.model.js";
import { logError } from "../utils/logError.js";
import { deleteFile, extractPublicIdFromUrl, uploadImage } from "./file.service.js";
import { applyVerificationAutoRevoke } from "./verificationAutoRevoke.service.js";

export const updateUserProfilePicture = async ({ userId, file }) => {
  const user = await User.findById(userId);
  if (!user) return null;

  const previousPictureUrl = user.profilePicture || "";
  const oldPublicId = extractPublicIdFromUrl(previousPictureUrl);
  const uploaded = await uploadImage({
    buffer: file.buffer,
    folder: "profile_pictures",
    maxWidth: 600,
    maxHeight: 600,
  });

  user.profilePicture = uploaded.secure_url;
  try {
    await user.save();
  } catch (error) {
    if (uploaded.public_id) {
      await deleteFile(uploaded.public_id).catch((cleanupError) =>
        logError("Failed to clean up profile image after save failure", cleanupError),
      );
    }
    throw error;
  }

  if (previousPictureUrl !== uploaded.secure_url) {
    await applyVerificationAutoRevoke({
      userId,
      previousUser: {
        profilePicture: previousPictureUrl,
        isVerified: user.isVerified,
        verificationStatus: user.verificationStatus,
      },
      nextPatch: { profilePicture: uploaded.secure_url },
    });
  }

  if (oldPublicId && oldPublicId !== uploaded.public_id) {
    try {
      await deleteFile(oldPublicId, "image");
    } catch (error) {
      logError("Cloudinary profile image delete failed", error);
    }
  }

  return uploaded.secure_url;
};
