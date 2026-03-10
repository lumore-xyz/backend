import assert from "node:assert/strict";
import test from "node:test";
import {
  sanitizePublicRuntimeConfig,
  validateAndNormalizeRuntimeConfigPatch,
} from "../services/mobileRuntimeConfig.service.js";

test("validateAndNormalizeRuntimeConfigPatch accepts valid payload", () => {
  const patch = validateAndNormalizeRuntimeConfigPatch({
    BASE_URL: "https://api.example.com  ",
    SOCKET_URL: "https://api.example.com/api/chat",
    ONESIGNAL_APP_ID: "abc-123",
    featureFlags: {
      new_home: true,
      banner_text: " Hello ",
      max_swipes: 5,
      nullable_flag: null,
    },
  });

  assert.deepEqual(patch, {
    BASE_URL: "https://api.example.com",
    SOCKET_URL: "https://api.example.com/api/chat",
    ONESIGNAL_APP_ID: "abc-123",
    featureFlags: {
      new_home: true,
      banner_text: "Hello",
      max_swipes: 5,
      nullable_flag: null,
    },
  });
});

test("validateAndNormalizeRuntimeConfigPatch rejects unknown keys", () => {
  assert.throws(
    () =>
      validateAndNormalizeRuntimeConfigPatch({
        UNKNOWN_KEY: "value",
      }),
    /Unknown runtime config key/,
  );
});

test("validateAndNormalizeRuntimeConfigPatch rejects invalid URLs", () => {
  assert.throws(
    () =>
      validateAndNormalizeRuntimeConfigPatch({
        BASE_URL: "not-a-url",
      }),
    /BASE_URL must be a valid URL/,
  );
});

test("validateAndNormalizeRuntimeConfigPatch rejects empty BASE_URL", () => {
  assert.throws(
    () =>
      validateAndNormalizeRuntimeConfigPatch({
        BASE_URL: "   ",
      }),
    /BASE_URL cannot be empty/,
  );
});

test("validateAndNormalizeRuntimeConfigPatch rejects invalid feature flag values", () => {
  assert.throws(
    () =>
      validateAndNormalizeRuntimeConfigPatch({
        featureFlags: {
          unsupported: ["nope"],
        },
      }),
    /featureFlags\.unsupported must be a string, number, boolean or null/,
  );
});

test("sanitizePublicRuntimeConfig strips unknown keys and keeps allowlisted fields", () => {
  const config = sanitizePublicRuntimeConfig({
    BASE_URL: "https://api.example.com",
    ONESIGNAL_APP_ID: "abc",
    featureFlags: {
      show_banner: false,
    },
    SERVER_ONLY_SECRET: "nope",
  });

  assert.equal(config.BASE_URL, "https://api.example.com");
  assert.equal(config.ONESIGNAL_APP_ID, "abc");
  assert.deepEqual(config.featureFlags, { show_banner: false });
  assert.equal("SERVER_ONLY_SECRET" in config, false);
});

test("sanitizePublicRuntimeConfig falls back to defaults for invalid required URLs", () => {
  const config = sanitizePublicRuntimeConfig({
    BASE_URL: "bad-url",
    SOCKET_URL: "",
  });

  assert.equal(config.BASE_URL, "https://api.lumore.xyz");
  assert.equal(config.SOCKET_URL, "https://api.lumore.xyz/api/chat");
});
