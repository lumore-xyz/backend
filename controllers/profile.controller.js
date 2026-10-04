import { updateUserProfile } from "../services/profileDetails.service.js";
import { logError } from "../utils/logError.js";

const FORBIDDEN_LOCATION_FIELDS = new Set([
  "location",
  "location.coordinates",
  "location.formattedAddress",
]);
const PROFILE_UPDATE_FIELDS = new Set([
  "username",
  "nickname",
  "realName",
  "phoneNumber",
  "gender",
  "dob",
  "height",
  "bio",
  "interests",
  "diet",
  "zodiacSign",
  "lifestyle",
  "lifestyle.drinking",
  "lifestyle.smoking",
  "lifestyle.pets",
  "work",
  "institution",
  "maritalStatus",
  "religion",
  "hometown",
  "homeTown",
  "languages",
  "personalityType",
  "profilePicture",
  "fieldVisibility",
  "bloodGroup",
]);

export const createUpdateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const attemptedLocationField = Object.keys(req.body || {}).find((key) =>
      FORBIDDEN_LOCATION_FIELDS.has(key),
    );

    if (attemptedLocationField) {
      return res.status(400).json({
        message:
          "Location updates must use POST /profile/:userId/update-location",
      });
    }

    const updateData = Object.fromEntries(
      Object.entries(req.body || {}).filter(([key]) =>
        PROFILE_UPDATE_FIELDS.has(key),
      ),
    );
    if (Object.hasOwn(updateData, "homeTown")) {
      if (!Object.hasOwn(updateData, "hometown")) {
        updateData.hometown = updateData.homeTown;
      }
      delete updateData.homeTown;
    }

    const updatedUser = await updateUserProfile({ userId, updateData });

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json(updatedUser);
  } catch (error) {
    if (error?.name === "ValidationError" || error?.name === "CastError") {
      return res.status(400).json({ message: "Invalid profile values" });
    }
    logError("Update profile failed", error);
    res.status(500).json({ message: "Unable to update profile right now." });
  }
};
