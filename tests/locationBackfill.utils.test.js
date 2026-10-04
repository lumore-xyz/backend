import assert from "node:assert/strict";
import test from "node:test";
import { classifyLocationBackfillCandidate } from "../utils/locationBackfill.js";

test("classifies clearly swapped coordinates for repair", () => {
  const result = classifyLocationBackfillCandidate({
    storedLocation: { type: "Point", coordinates: [12.9716, 77.5946] },
    geocodedPoint: { latitude: 12.9716, longitude: 77.5946 },
  });

  assert.equal(result.action, "swap");
  assert.equal(result.reason, "stored_far_swapped_close");
  assert.deepEqual(result.swappedPoint, {
    latitude: 12.9716,
    longitude: 77.5946,
  });
});

test("skips ambiguous rows instead of blindly swapping", () => {
  const result = classifyLocationBackfillCandidate({
    storedLocation: { type: "Point", coordinates: [25, 25] },
    geocodedPoint: { latitude: 12.9716, longitude: 77.5946 },
  });

  assert.equal(result.action, "skip");
  assert.equal(result.reason, "ambiguous_location_mismatch");
});
