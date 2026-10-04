import { updateUserLocation as saveUserLocation } from "../services/profileLocation.service.js";

/**
 * Update user location
 * POST /api/location
 */
export const updateUserLocation = async (req, res) => {
  const userId = req.user.id;
  const { latitude, longitude, formattedAddress } = req.body || {};

  const location = await saveUserLocation({
    userId,
    latitude,
    longitude,
    formattedAddress,
  });
  if (!location) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  return res.json({
    success: true,
    message: "Location updated",
    data: location,
  });
};

