import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizePlatform,
} from "../services/mobileAppVersion.service.js";

test("normalizePlatform accepts known platforms case-insensitively", () => {
  assert.equal(normalizePlatform("android"), "android");
  assert.equal(normalizePlatform("IOS"), "ios");
});

test("normalizePlatform rejects unknown platforms", () => {
  assert.throws(() => normalizePlatform("windows"));
  assert.throws(() => normalizePlatform(""));
  assert.throws(() => normalizePlatform(undefined));
});
