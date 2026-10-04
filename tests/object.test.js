import assert from "node:assert/strict";
import test from "node:test";
import { isPlainObject } from "../utils/object.js";

test("isPlainObject accepts regular and null-prototype objects", () => {
  assert.equal(isPlainObject({ value: 1 }), true);
  assert.equal(isPlainObject(Object.create(null)), true);
});

test("isPlainObject rejects arrays and class instances", () => {
  assert.equal(isPlainObject([]), false);
  assert.equal(isPlainObject(new Date()), false);
  assert.equal(isPlainObject(new Map()), false);
});
