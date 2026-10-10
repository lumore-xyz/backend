import {
  autocompleteLocations,
  getLocationDetails,
  reverseGeocodeLocation,
} from "../services/googlePlaces.service.js";
import { parseCoordinate } from "../utils/location.js";
import { logError } from "../utils/logError.js";

const sendProviderError = (res, error) => {
  if (error.statusCode === 503) return res.status(503).json({ message: error.message });
  logError("[community-location] Google request failed", error);
  const messages = {
    PERMISSION_DENIED: "Google Maps rejected this request. Enable Places API (New) and Geocoding API, and check the key restrictions and billing.",
    REQUEST_DENIED: "Google Maps rejected this request. Enable the required API, and check the key restrictions and billing.",
    UNAUTHENTICATED: "Google Maps rejected the backend key. Check that the key is valid and its restrictions allow backend requests.",
    RESOURCE_EXHAUSTED: "Google Maps usage limit reached. Check the project quota and billing.",
  };
  return res.status(502).json({
    message: messages[error.providerStatus] || "Google location search failed. Check the backend logs and Google Maps API setup.",
    code: error.providerStatus || "GOOGLE_LOCATION_ERROR",
  });
};

export const searchLocations = async (req, res) => {
  const input = String(req.body?.input || "").trim();
  const sessionToken = String(req.body?.sessionToken || "").trim();
  if (input.length < 3 || input.length > 200) {
    return res.status(400).json({ message: "Search must be 3-200 characters" });
  }
  try {
    return res.status(200).json({
      predictions: await autocompleteLocations({ input, sessionToken }),
    });
  } catch (error) {
    return sendProviderError(res, error);
  }
};

export const getLocationSearchDetails = async (req, res) => {
  const placeId = String(req.body?.placeId || "").trim();
  if (!placeId || placeId.length > 300) return res.status(400).json({ message: "placeId is required" });
  try {
    return res.status(200).json(await getLocationDetails({
      placeId,
      sessionToken: String(req.body?.sessionToken || "").trim(),
    }));
  } catch (error) {
    return sendProviderError(res, error);
  }
};

export const reverseGeocode = async (req, res) => {
  const latitude = parseCoordinate(req.body?.latitude);
  const longitude = parseCoordinate(req.body?.longitude);
  if (latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return res.status(400).json({ message: "Valid latitude and longitude are required" });
  }
  try {
    return res.status(200).json({ formattedAddress: await reverseGeocodeLocation({ latitude, longitude }) });
  } catch (error) {
    return sendProviderError(res, error);
  }
};
