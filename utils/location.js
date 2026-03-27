const EARTH_RADIUS_METERS = 6371000;

export const LOCATION_BACKFILL_DEFAULTS = {
  maxSwappedDistanceKm: 25,
  minStoredDistanceKm: 100,
  swapDistanceRatioThreshold: 10,
};

const toTrimmedAddress = (formattedAddress) => String(formattedAddress || "").trim();

const assertFiniteCoordinate = (value, label) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a number`);
  }
  return parsed;
};

export const buildCanonicalLocation = ({
  latitude,
  longitude,
  formattedAddress = "",
}) => {
  const normalizedLatitude = assertFiniteCoordinate(latitude, "Latitude");
  const normalizedLongitude = assertFiniteCoordinate(longitude, "Longitude");

  if (normalizedLatitude < -90 || normalizedLatitude > 90) {
    throw new Error("Latitude must be between -90 and 90");
  }

  if (normalizedLongitude < -180 || normalizedLongitude > 180) {
    throw new Error("Longitude must be between -180 and 180");
  }

  return {
    type: "Point",
    coordinates: [normalizedLongitude, normalizedLatitude],
    formattedAddress: toTrimmedAddress(formattedAddress),
  };
};

export const getGeoPointFromLocation = (location) => {
  const coordinates = location?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length !== 2) {
    return null;
  }

  const longitude = Number(coordinates[0]);
  const latitude = Number(coordinates[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return null;
  }

  return { latitude, longitude };
};

export const calculateDistanceMeters = (pointA, pointB) => {
  if (!pointA || !pointB) return null;

  const latitude1 = Number(pointA.latitude);
  const longitude1 = Number(pointA.longitude);
  const latitude2 = Number(pointB.latitude);
  const longitude2 = Number(pointB.longitude);

  if (
    !Number.isFinite(latitude1) ||
    !Number.isFinite(longitude1) ||
    !Number.isFinite(latitude2) ||
    !Number.isFinite(longitude2)
  ) {
    return null;
  }

  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(latitude2 - latitude1);
  const longitudeDelta = toRadians(longitude2 - longitude1);

  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(latitude1)) *
      Math.cos(toRadians(latitude2)) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const classifyLocationBackfillCandidate = ({
  storedLocation,
  geocodedPoint,
  maxSwappedDistanceKm = LOCATION_BACKFILL_DEFAULTS.maxSwappedDistanceKm,
  minStoredDistanceKm = LOCATION_BACKFILL_DEFAULTS.minStoredDistanceKm,
  swapDistanceRatioThreshold = LOCATION_BACKFILL_DEFAULTS.swapDistanceRatioThreshold,
}) => {
  const storedPoint = getGeoPointFromLocation(storedLocation);
  if (!storedPoint) {
    return {
      action: "skip",
      reason: "missing_stored_coordinates",
      storedPoint: null,
      swappedPoint: null,
      storedDistanceKm: null,
      swappedDistanceKm: null,
      distanceRatio: null,
    };
  }

  if (!geocodedPoint) {
    return {
      action: "skip",
      reason: "missing_geocoded_point",
      storedPoint,
      swappedPoint: null,
      storedDistanceKm: null,
      swappedDistanceKm: null,
      distanceRatio: null,
    };
  }

  const swappedPoint = {
    latitude: storedPoint.longitude,
    longitude: storedPoint.latitude,
  };

  if (
    swappedPoint.latitude < -90 ||
    swappedPoint.latitude > 90 ||
    swappedPoint.longitude < -180 ||
    swappedPoint.longitude > 180
  ) {
    return {
      action: "keep",
      reason: "swap_out_of_range",
      storedPoint,
      swappedPoint,
      storedDistanceKm: null,
      swappedDistanceKm: null,
      distanceRatio: null,
    };
  }

  const storedDistanceMeters = calculateDistanceMeters(storedPoint, geocodedPoint);
  const swappedDistanceMeters = calculateDistanceMeters(swappedPoint, geocodedPoint);
  const storedDistanceKm =
    storedDistanceMeters === null ? null : storedDistanceMeters / 1000;
  const swappedDistanceKm =
    swappedDistanceMeters === null ? null : swappedDistanceMeters / 1000;

  if (storedDistanceKm === null || swappedDistanceKm === null) {
    return {
      action: "skip",
      reason: "distance_calculation_failed",
      storedPoint,
      swappedPoint,
      storedDistanceKm,
      swappedDistanceKm,
      distanceRatio: null,
    };
  }

  const safeSwappedDistance = swappedDistanceKm <= 0 ? 0.000001 : swappedDistanceKm;
  const distanceRatio = storedDistanceKm / safeSwappedDistance;
  const shouldSwap =
    swappedDistanceKm <= maxSwappedDistanceKm &&
    (storedDistanceKm >= minStoredDistanceKm ||
      distanceRatio >= swapDistanceRatioThreshold);

  if (shouldSwap) {
    return {
      action: "swap",
      reason:
        storedDistanceKm >= minStoredDistanceKm
          ? "stored_far_swapped_close"
          : "swapped_materially_closer",
      storedPoint,
      swappedPoint,
      storedDistanceKm,
      swappedDistanceKm,
      distanceRatio,
    };
  }

  if (storedDistanceKm <= maxSwappedDistanceKm) {
    return {
      action: "keep",
      reason: "stored_location_consistent",
      storedPoint,
      swappedPoint,
      storedDistanceKm,
      swappedDistanceKm,
      distanceRatio,
    };
  }

  return {
    action: "skip",
    reason: "ambiguous_location_mismatch",
    storedPoint,
    swappedPoint,
    storedDistanceKm,
    swappedDistanceKm,
    distanceRatio,
  };
};
