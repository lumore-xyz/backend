/**
 * Calculate the distance between two points using the Haversine formula
 * @param {number} lat1 - Latitude of first point in degrees
 * @param {number} lon1 - Longitude of first point in degrees
 * @param {number} lat2 - Latitude of second point in degrees
 * @param {number} lon2 - Longitude of second point in degrees
 * @returns {number} Distance in kilometers
 */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Convert degrees to radians
 * @param {number} degrees - Angle in degrees
 * @returns {number} Angle in radians
 */
const toRad = (degrees) => {
  return degrees * (Math.PI / 180);
};

/**
 * Check if a user's location is within another user's preferred distance
 * @param {Object} user1Location - First user's location object
 * @param {Object} user2Location - Second user's location object
 * @param {number} maxDistance - Maximum allowed distance in kilometers
 * @returns {boolean} True if within distance, false otherwise
 */
export const isWithinDistance = (user1Location, user2Location, maxDistance) => {
  if (!user1Location?.coordinates || !user2Location?.coordinates) return false;

  const [lon1, lat1] = user1Location.coordinates;
  const [lon2, lat2] = user2Location.coordinates;

  const distance = calculateDistance(lat1, lon1, lat2, lon2);
  return distance <= maxDistance;
};
