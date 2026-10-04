import assert from "node:assert/strict";
import test from "node:test";
import User from "../models/user.model.js";
import { buildCanonicalLocation } from "../utils/location.js";

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
