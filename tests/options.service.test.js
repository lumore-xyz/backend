import assert from "node:assert/strict";
import test from "node:test";

import { normalizeOptionsPayload } from "../services/options.service.js";
import {
  IONICON_CATALOG,
  IONICON_CATEGORY_ORDER,
  IONICON_FLAT_LIST,
  isKnownIoniconName,
  isSupportedIconLibrary,
} from "../libs/iconCatalog.js";

test("normalizeOptionsPayload preserves icon when valid", () => {
  const out = normalizeOptionsPayload({
    interestOptions: [
      {
        label: "Music",
        value: "music",
        icon: { library: "Ionicons", name: "musical-notes-outline" },
      },
      { label: "Travel", value: "travel" },
    ],
  });

  assert.equal(out.interestOptions.length, 2);
  assert.deepEqual(out.interestOptions[0].icon, {
    library: "Ionicons",
    name: "musical-notes-outline",
  });
  assert.equal(out.interestOptions[1].icon, undefined);
});

test("normalizeOptionsPayload drops invalid icon", () => {
  const out = normalizeOptionsPayload({
    interestOptions: [
      {
        label: "Music",
        value: "music",
        icon: { library: "", name: "heart-outline" },
      },
      {
        label: "Travel",
        value: "travel",
        icon: { library: "Ionicons" },
      },
      {
        label: "Reading",
        value: "reading",
        icon: "heart-outline",
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

test("IONICON_CATEGORY_ORDER is stable", () => {
  assert.ok(Array.isArray(IONICON_CATEGORY_ORDER));
  assert.ok(IONICON_CATEGORY_ORDER.length >= 5);
});

test("IONICON_CATALOG only contains known icon names", () => {
  for (const [category, icons] of Object.entries(IONICON_CATALOG)) {
    assert.ok(Array.isArray(icons));
    for (const icon of icons) {
      assert.equal(icon.library, "Ionicons", `bad library in ${category}`);
      assert.ok(icon.name.endsWith("-outline"), `bad name in ${category}: ${icon.name}`);
    }
  }
});

test("IONICON_FLAT_LIST is unique", () => {
  const seen = new Set();
  for (const icon of IONICON_FLAT_LIST) {
    const key = `${icon.library}:${icon.name}`;
    assert.ok(!seen.has(key), `duplicate icon ${key}`);
    seen.add(key);
  }
});

test("isKnownIoniconName + isSupportedIconLibrary", () => {
  assert.equal(isKnownIoniconName("heart-outline"), true);
  assert.equal(isKnownIoniconName("nonexistent-icon"), false);
  assert.equal(isSupportedIconLibrary("Ionicons"), true);
  assert.equal(isSupportedIconLibrary("ionicons"), true);
  assert.equal(isSupportedIconLibrary("MaterialCommunityIcons"), false);
});
