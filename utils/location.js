const EARTH_RADIUS_METERS = 6371000;
export const GEOJSON_POINT_TYPE = "Point";

const hasValidGeoCoordinates = (latitude, longitude) =>
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  latitude >= -90 &&
  latitude <= 90 &&
  longitude >= -180 &&
  longitude <= 180;

export const parseCoordinate = (value) => {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && !value.trim())
  ) {
    return null;
  }

  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
};

export const formattedAddressPartsExpression = () => ({
  $split: [{ $trim: { input: "$location.formattedAddress" } }, ","],
});

export const extractLocationTags = (formattedAddress) => {
  const segments = String(formattedAddress || "")
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (!segments.length) return { city: "", country: "", pincode: "" };

  const country = segments.at(-1) || "";
  const pincodeCandidate = segments.at(-2) || "";
  const pincode = pincodeCandidate.match(/\b\d{4,10}\b/)?.[0] || pincodeCandidate;
  const city = segments.at(-4) || segments.at(-3) || "";

  return { city, country, pincode };
};

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
    type: GEOJSON_POINT_TYPE,
    coordinates: [normalizedLongitude, normalizedLatitude],
    formattedAddress: String(formattedAddress || "").trim(),
  };
};

export const getGeoPointFromLocation = (location) => {
  const coordinates = location?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length !== 2) {
    return null;
  }

  const longitude = Number(coordinates[0]);
  const latitude = Number(coordinates[1]);
  if (!hasValidGeoCoordinates(latitude, longitude)) return null;

  return { latitude, longitude };
};

export const hasValidLocation = (location) => {
  const point = getGeoPointFromLocation(location);
  return Boolean(point && (point.longitude !== 0 || point.latitude !== 0));
};

export const calculateDistanceMeters = (pointA, pointB) => {
  if (!pointA || !pointB) return null;

  const latitude1 = Number(pointA.latitude);
  const longitude1 = Number(pointA.longitude);
  const latitude2 = Number(pointB.latitude);
  const longitude2 = Number(pointB.longitude);

  if (
    !hasValidGeoCoordinates(latitude1, longitude1) ||
    !hasValidGeoCoordinates(latitude2, longitude2)
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
  const haversine = Math.min(1, a);

  return 2 * EARTH_RADIUS_METERS * Math.atan2(
    Math.sqrt(haversine),
    Math.sqrt(1 - haversine),
  );
};
