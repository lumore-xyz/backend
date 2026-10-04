import { updateUserProfilePicture } from "../services/profilePicture.service.js";

export const updateProfilePicture = async (req, res) => {
  const userId = req.user.id;
  const file = req.file;

  if (!file) return res.status(400).json({ message: "No file uploaded" });
  if (!file.buffer)
    return res.status(400).json({ message: "Invalid file buffer" });

  const profilePicture = await updateUserProfilePicture({ userId, file });
  if (!profilePicture) return res.status(404).json({ message: "User not found" });

  return res.status(200).json({
    message: "Profile picture updated successfully",
    profilePicture,
  });
};
