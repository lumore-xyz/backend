import assert from "node:assert/strict";
import test from "node:test";
import User from "../models/user.model.js";
import {
  generateCleanUsername,
  generateUniqueUsername,
} from "../services/username.service.js";

test("generateCleanUsername handles missing and formatted names", () => {
  assert.equal(generateCleanUsername("  O’Neil Smith! "), "oneil_smith");
  assert.equal(generateCleanUsername(undefined), "");
});

test("generateUniqueUsername queries collisions once and picks the first free name", async () => {
  const originalDistinct = User.distinct;
  let queryCount = 0;
  User.distinct = async (_field, filter) => {
    queryCount++;
    assert.equal(filter.username.$in.length, 101);
    return ["alex", "alex_1"];
  };

  try {
    assert.equal(await generateUniqueUsername("Alex"), "alex_2");
    assert.equal(queryCount, 1);
  } finally {
    User.distinct = originalDistinct;
  }
});
