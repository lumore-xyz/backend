import { updateUserFieldVisibility } from "../services/profileVisibility.service.js";
import { PROFILE_VISIBILITY_VALUES } from "../utils/profileVisibility.js";

// Update Field Visibility Settings
export const updateFieldVisibility = async (req, res) => {
  const userId = req.user.id;
  const { fields } = req.body || {};

  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    return res.status(400).json({
      message:
        "Invalid input. Expected fields object with visibility settings",
    });
  }

  const invalidFields = Object.entries(fields).filter(
    ([_, visibility]) => !PROFILE_VISIBILITY_VALUES.includes(visibility),
  );

  if (invalidFields.length > 0) {
    return res.status(400).json({
      message: `Invalid visibility value. Must be one of: ${PROFILE_VISIBILITY_VALUES.join(
        ", ",
      )}`,
      invalidFields: invalidFields.map(([field]) => field),
    });
  }

  const fieldVisibility = await updateUserFieldVisibility({ userId, fields });
  if (!fieldVisibility) {
    return res.status(404).json({ message: "User not found" });
  }

  return res.status(200).json({
    message: "Field visibility updated successfully",
    fieldVisibility,
  });
};
