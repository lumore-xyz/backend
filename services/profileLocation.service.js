import { extractLocationTags, getGeoPointFromLocation } from "../utils/location.js";
import User from "../models/user.model.js";
import { triggerOneSignalProfileTagSync } from "./profileTagSync.service.js";

export const updateUserLocation = async ({
  userId,
  latitude,
  longitude,
  formattedAddress,
}) => {
  const user = await User.findById(userId);
  if (!user) return null;

  const previousCountry = extractLocationTags(user.location?.formattedAddress).country;
  await user.updateLocation(latitude, longitude, formattedAddress);
  const currentCountry = extractLocationTags(user.location?.formattedAddress).country;
  if (previousCountry !== currentCountry) triggerOneSignalProfileTagSync(user);

  const geoPoint = getGeoPointFromLocation(user.location);
  return {
    location: user.location,
    latitude: geoPoint?.latitude ?? null,
    longitude: geoPoint?.longitude ?? null,
    lastLocationUpdate: user.lastLocationUpdate,
  };
};
