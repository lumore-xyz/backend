import {
  getProfilePreferences,
  updateProfilePreferences,
} from "../services/profilePreference.service.js";

export const updateUserPreference = async (req, res) => {
  try {
    const result = await updateProfilePreferences(req.user.id, req.body);
    if (result.error === "USER_NOT_FOUND") {
      return res.status(404).json({ message: "User not found" });
    }
    if (result.error === "INVALID_INTERESTED_IN") {
      return res.status(400).json({
        message: "Invalid interestedIn value. Allowed values: man, woman.",
      });
    }

    return res
      .status(200)
      .json({ message: "Preferences updated successfully", preferences: result.preferences });
  } catch (error) {
    if (error?.name === "ValidationError" || error?.name === "CastError") {
      return res.status(400).json({ message: "Invalid preference values" });
    }
    throw error;
  }
};

export const getUserPreference = async (req, res) => {
  const preferences = await getProfilePreferences(req.user.id);
  return res.status(200).json(preferences);
};
