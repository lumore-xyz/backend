const PLACES_API = "https://places.googleapis.com/v1";
const GOOGLE_MAPS_KEY = () => String(process.env.GOOGLE_MAPS_KEY || "").trim();

const providerError = (status, httpStatus) => Object.assign(
  new Error("Google location provider request failed"),
  { statusCode: 502, providerStatus: status || "UNKNOWN", providerHttpStatus: httpStatus },
);

const requestGoogle = async (url, options = {}) => {
  const key = GOOGLE_MAPS_KEY();
  if (!key) throw Object.assign(new Error("Google location search is not configured"), { statusCode: 503 });
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), "X-Goog-Api-Key": key },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError(data.error?.status, response.status);
  return data;
};

export const autocompleteLocations = async ({ input, sessionToken }) => {
  const data = await requestGoogle(`${PLACES_API}/places:autocomplete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input, sessionToken }),
  });
  return (data.suggestions || []).flatMap(({ placePrediction }) => placePrediction ? [{
    placeId: placePrediction.placeId,
    description: placePrediction.text?.text || "",
    primaryText: placePrediction.structuredFormat?.mainText?.text || placePrediction.text?.text || "",
    secondaryText: placePrediction.structuredFormat?.secondaryText?.text || "",
  }] : []);
};

export const getLocationDetails = async ({ placeId, sessionToken }) => {
  const url = new URL(`${PLACES_API}/places/${encodeURIComponent(placeId)}`);
  if (sessionToken) url.searchParams.set("sessionToken", sessionToken);
  const data = await requestGoogle(url, {
    headers: { "X-Goog-FieldMask": "id,formattedAddress,location,displayName" },
  });
  return {
    placeId: data.id,
    formattedAddress: data.formattedAddress || data.displayName?.text || "",
    latitude: data.location?.latitude,
    longitude: data.location?.longitude,
  };
};

export const reverseGeocodeLocation = async ({ latitude, longitude }) => {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${latitude},${longitude}`);
  const key = GOOGLE_MAPS_KEY();
  if (!key) throw Object.assign(new Error("Google location search is not configured"), { statusCode: 503 });
  url.searchParams.set("key", key);
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError(data.error?.status, response.status);
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw providerError(data.status, response.status);
  }
  return data.results?.[0]?.formatted_address || "Dropped pin";
};
