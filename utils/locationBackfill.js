import {
  calculateDistanceMeters,
  getGeoPointFromLocation,
} from "./location.js";

const LOCATION_BACKFILL_DEFAULTS = {
  maxSwappedDistanceKm: 25,
  minStoredDistanceKm: 100,
  swapDistanceRatioThreshold: 10,
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
  const storedDistanceKm = storedDistanceMeters === null ? null : storedDistanceMeters / 1000;
  const swappedDistanceKm = swappedDistanceMeters === null ? null : swappedDistanceMeters / 1000;
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
  const shouldSwap = swappedDistanceKm <= maxSwappedDistanceKm &&
    (storedDistanceKm >= minStoredDistanceKm || distanceRatio >= swapDistanceRatioThreshold);

  if (shouldSwap) {
    return {
      action: "swap",
      reason: storedDistanceKm >= minStoredDistanceKm
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
