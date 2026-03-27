import assert from "node:assert/strict";
import test from "node:test";
import User from "../models/user.model.js";
import {
  buildCanonicalLocation,
  classifyLocationBackfillCandidate,
} from "../utils/location.js";

test("buildCanonicalLocation stores coordinates in longitude latitude order", () => {
  const location = buildCanonicalLocation({
    latitude: 12.9716,
    longitude: 77.5946,
    formattedAddress: "Bengaluru, Karnataka 560001, India",
  });

  assert.deepEqual(location, {
    type: "Point",
    coordinates: [77.5946, 12.9716],
    formattedAddress: "Bengaluru, Karnataka 560001, India",
  });
});

test("user.updateLocation stores coordinates canonically without hitting the database", async () => {
  const user = new User({
    username: "location-test-user",
  });
  const originalSave = user.save;
  user.save = async function saveStub() {
    return this;
  };

  try {
    await user.updateLocation(
      12.9716,
      77.5946,
      "Bengaluru, Karnataka 560001, India",
    );
  } finally {
    user.save = originalSave;
  }

  assert.deepEqual(user.location.coordinates, [77.5946, 12.9716]);
  assert.equal(
    user.location.formattedAddress,
    "Bengaluru, Karnataka 560001, India",
  );
  assert.ok(user.lastLocationUpdate instanceof Date);
});

test("classifyLocationBackfillCandidate flags clearly swapped coordinates for repair", () => {
  const result = classifyLocationBackfillCandidate({
    storedLocation: {
      type: "Point",
      coordinates: [12.9716, 77.5946],
    },
    geocodedPoint: {
      latitude: 12.9716,
      longitude: 77.5946,
    },
  });

  assert.equal(result.action, "swap");
  assert.equal(result.reason, "stored_far_swapped_close");
  assert.deepEqual(result.swappedPoint, {
    latitude: 12.9716,
    longitude: 77.5946,
  });
  assert.equal(
    buildCanonicalLocation({
      latitude: result.swappedPoint.latitude,
      longitude: result.swappedPoint.longitude,
      formattedAddress: "",
    }).coordinates[0],
    77.5946,
  );
});

test("classifyLocationBackfillCandidate skips ambiguous rows instead of blindly swapping", () => {
  const result = classifyLocationBackfillCandidate({
    storedLocation: {
      type: "Point",
      coordinates: [25, 25],
    },
    geocodedPoint: {
      latitude: 12.9716,
      longitude: 77.5946,
    },
  });

  assert.equal(result.action, "skip");
  assert.equal(result.reason, "ambiguous_location_mismatch");
});
