import assert from "node:assert/strict";
import test from "node:test";

import { normalizeOptionsPayload } from "../services/options.service.js";

test("normalizeOptionsPayload preserves icon when valid", () => {
  const out = normalizeOptionsPayload({
    interestOptions: [
      {
        label: "Music",
        value: "music",
        icon: { library: "Lucide", name: "music" },
      },
      { label: "Travel", value: "travel" },
    ],
  });

  assert.equal(out.interestOptions.length, 2);
  assert.deepEqual(out.interestOptions[0].icon, {
    library: "Lucide",
    name: "music",
  });
  assert.equal(out.interestOptions[1].icon, undefined);
});

test("normalizeOptionsPayload keeps any library+name pair (no catalog validation)", () => {
  const out = normalizeOptionsPayload({
    interestOptions: [
      {
        label: "Custom",
        value: "custom",
        icon: { library: "Ionicons", name: "heart-outline" },
      },
      {
        label: "Lucide",
        value: "lucide",
        icon: { library: "Lucide", name: "nonexistent-icon" },
      },
    ],
  });

  assert.deepEqual(out.interestOptions[0].icon, {
    library: "Ionicons",
    name: "heart-outline",
  });
  assert.deepEqual(out.interestOptions[1].icon, {
    library: "Lucide",
    name: "nonexistent-icon",
  });
});

test("normalizeOptionsPayload drops malformed icon", () => {
  const out = normalizeOptionsPayload({
    interestOptions: [
      {
        label: "EmptyLib",
        value: "emptylib",
        icon: { library: "", name: "heart-outline" },
      },
      {
        label: "EmptyName",
        value: "emptyname",
        icon: { library: "Ionicons" },
      },
      {
        label: "RawString",
        value: "rawstring",
        icon: "heart-outline",
      },
      {
        label: "Array",
        value: "array",
        icon: ["Lucide", "music"],
      },
    ],
  });

  for (const item of out.interestOptions) {
    assert.equal(item.icon, undefined);
  }
});

test("normalizeOptionsPayload rejects empty entries", () => {
  assert.throws(
    () =>
      normalizeOptionsPayload({
        interestOptions: [{ label: "", value: "" }],
      }),
    /non-empty label and value/,
  );
});

test("normalizeOptionsPayload de-duplicates by value", () => {
  const out = normalizeOptionsPayload({
    interestOptions: [
      { label: "Music", value: "music" },
      { label: "Music 2", value: "music" },
    ],
  });
  assert.equal(out.interestOptions.length, 1);
});