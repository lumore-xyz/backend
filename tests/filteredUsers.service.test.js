import assert from "node:assert/strict";
import test from "node:test";
import UserPreference from "../models/preference.model.js";
import { buildFilteredUserQuery } from "../services/filteredUsers.service.js";
import { escapeRegex } from "../utils/regex.js";

test("escapeRegex keeps search punctuation literal", () => {
  assert.equal(escapeRegex("ann+e@example.com"), "ann\\+e@example\\.com");
});

test("buildFilteredUserQuery combines profile and preference filters", async () => {
  const originalFind = UserPreference.find;
  let preferenceQuery;
  UserPreference.find = (query) => {
    preferenceQuery = query;
    return {
      select() { return this; },
      lean: async () => [{ user: { toString: () => "user-1" } }],
    };
  };

  try {
    const query = await buildFilteredUserQuery({
      username: "alice",
      prefInterestedIn: "woman",
    });

    assert.deepEqual(preferenceQuery, {
      $and: [{ interestedIn: { $regex: /^woman$/i } }],
    });
    assert.deepEqual(query, {
      $and: [
        { username: { $regex: /^alice$/i } },
        { _id: { $in: ["user-1"] } },
      ],
    });
  } finally {
    UserPreference.find = originalFind;
  }
});

test("buildFilteredUserQuery does not query preferences without preference filters", async () => {
  const originalFind = UserPreference.find;
  UserPreference.find = () => {
    throw new Error("unexpected preference lookup");
  };

  try {
    assert.deepEqual(await buildFilteredUserQuery({ isActive: true }), {
      $and: [{ isActive: true }],
    });
  } finally {
    UserPreference.find = originalFind;
  }
});
