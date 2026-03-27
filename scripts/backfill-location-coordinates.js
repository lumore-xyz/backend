import "dotenv/config";
import axios from "axios";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import User from "../models/user.model.js";
import {
  buildCanonicalLocation,
  classifyLocationBackfillCandidate,
} from "../utils/location.js";

const REQUEST_DELAY_MS = 1100;
const USER_AGENT = "LumoreLocationBackfill/1.0";
const APPLY_MODE = process.argv.includes("--apply");
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Number.parseInt(LIMIT_ARG.split("=")[1], 10) : null;

const geocodeCache = new Map();
let lastGeocodeAt = 0;

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const roundTo = (value, decimals = 2) => {
  if (!Number.isFinite(value)) return null;
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
};

const buildRowSummary = (user, result) => ({
  userId: user._id.toString(),
  username: user.username || null,
  formattedAddress: user?.location?.formattedAddress || "",
  reason: result.reason,
  storedCoordinates: user?.location?.coordinates || null,
  storedDistanceKm: roundTo(result.storedDistanceKm),
  swappedDistanceKm: roundTo(result.swappedDistanceKm),
  distanceRatio: roundTo(result.distanceRatio),
});

const geocodeFormattedAddress = async (formattedAddress) => {
  const normalizedAddress = String(formattedAddress || "").trim();
  if (!normalizedAddress) return null;

  if (geocodeCache.has(normalizedAddress)) {
    return geocodeCache.get(normalizedAddress);
  }

  const now = Date.now();
  const waitMs = Math.max(0, REQUEST_DELAY_MS - (now - lastGeocodeAt));
  if (waitMs > 0) {
    await sleep(waitMs);
  }

  lastGeocodeAt = Date.now();
  const response = await axios.get(
    "https://nominatim.openstreetmap.org/search",
    {
      params: {
        q: normalizedAddress,
        format: "jsonv2",
        limit: 1,
      },
      headers: {
        "User-Agent": USER_AGENT,
      },
      timeout: 15000,
    },
  );

  const firstResult = Array.isArray(response.data) ? response.data[0] : null;
  const geocodedPoint =
    firstResult &&
    Number.isFinite(Number(firstResult.lat)) &&
    Number.isFinite(Number(firstResult.lon))
      ? {
          latitude: Number(firstResult.lat),
          longitude: Number(firstResult.lon),
        }
      : null;

  geocodeCache.set(normalizedAddress, geocodedPoint);
  return geocodedPoint;
};

async function run() {
  await connectDB();

  const users = await User.find({
    "location.formattedAddress": { $type: "string", $ne: "" },
    "location.coordinates.1": { $exists: true },
    "location.coordinates": { $ne: [0, 0] },
  })
    .select("_id username location lastLocationUpdate")
    .sort({ _id: 1 })
    .lean();

  const rows = Number.isFinite(LIMIT) && LIMIT > 0 ? users.slice(0, LIMIT) : users;
  const summary = {
    applyMode: APPLY_MODE,
    totalUsers: rows.length,
    geocodeMisses: 0,
    swapCandidates: 0,
    kept: 0,
    ambiguous: 0,
    applied: 0,
  };

  const updates = [];
  const ambiguousRows = [];
  const geocodeMissRows = [];

  for (const user of rows) {
    const formattedAddress = user?.location?.formattedAddress || "";
    const geocodedPoint = await geocodeFormattedAddress(formattedAddress);

    if (!geocodedPoint) {
      summary.geocodeMisses += 1;
      geocodeMissRows.push({
        userId: user._id.toString(),
        username: user.username || null,
        formattedAddress,
      });
      continue;
    }

    const result = classifyLocationBackfillCandidate({
      storedLocation: user.location,
      geocodedPoint,
    });

    if (result.action === "swap") {
      summary.swapCandidates += 1;

      if (APPLY_MODE && result.swappedPoint) {
        updates.push({
          updateOne: {
            filter: {
              _id: user._id,
              "location.coordinates": user.location.coordinates,
              "location.formattedAddress": formattedAddress,
            },
            update: {
              $set: {
                location: buildCanonicalLocation({
                  latitude: result.swappedPoint.latitude,
                  longitude: result.swappedPoint.longitude,
                  formattedAddress,
                }),
              },
            },
          },
        });
      }

      continue;
    }

    if (result.action === "keep") {
      summary.kept += 1;
      continue;
    }

    summary.ambiguous += 1;
    ambiguousRows.push(buildRowSummary(user, result));
  }

  if (updates.length) {
    const writeResult = await User.bulkWrite(updates, { ordered: false });
    summary.applied =
      Number(writeResult.modifiedCount || 0) + Number(writeResult.upsertedCount || 0);
  }

  console.info("[backfill-location-coordinates] summary", summary);

  if (ambiguousRows.length) {
    console.info(
      "[backfill-location-coordinates] ambiguous_rows",
      ambiguousRows,
    );
  }

  if (geocodeMissRows.length) {
    console.info(
      "[backfill-location-coordinates] geocode_miss_rows",
      geocodeMissRows,
    );
  }
}

run()
  .catch((error) => {
    console.error("[backfill-location-coordinates] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
