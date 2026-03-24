import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPasswordResetLink,
  createPasswordResetToken,
  getPasswordResetExpiryMinutes,
  hashPasswordResetToken,
  isStrongPassword,
  isValidEmail,
  normalizeEmail,
} from "../services/passwordReset.service.js";

const withEnv = async (overrides, fn) => {
  const previous = {};

  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

test("createPasswordResetToken returns token, hashedToken, and expiry", () => {
  const before = Date.now();
  const { token, hashedToken, expiresAt } = createPasswordResetToken();
  const after = Date.now();

  assert.equal(token.length, 64);
  assert.equal(hashedToken.length, 64);
  assert.equal(hashPasswordResetToken(token), hashedToken);
  assert.ok(expiresAt instanceof Date);
  assert.ok(expiresAt.getTime() > before);
  assert.ok(expiresAt.getTime() >= after);
});

test("buildPasswordResetLink appends token and email to PASSWORD_RESET_URL", async () => {
  await withEnv(
    {
      PASSWORD_RESET_URL: "lumore://reset-password",
      PASSWORD_RESET_URL_TEMPLATE: undefined,
    },
    async () => {
      const link = buildPasswordResetLink({
        token: "abc123",
        email: "Test@Example.com",
      });

      assert.equal(
        link,
        "lumore://reset-password?token=abc123&email=test%40example.com",
      );
    },
  );
});

test("buildPasswordResetLink supports PASSWORD_RESET_URL_TEMPLATE placeholders", async () => {
  await withEnv(
    {
      PASSWORD_RESET_URL: undefined,
      PASSWORD_RESET_URL_TEMPLATE:
        "https://lumore.xyz/reset?token={token}&email={email}",
    },
    async () => {
      const link = buildPasswordResetLink({
        token: "abc123",
        email: "test@example.com",
      });
      assert.equal(
        link,
        "https://lumore.xyz/reset?token=abc123&email=test%40example.com",
      );
    },
  );
});

test("email and password validators align with reset flow requirements", async () => {
  await withEnv({ PASSWORD_RESET_EXPIRY_MINUTES: "45" }, async () => {
    assert.equal(normalizeEmail("  User@Example.Com "), "user@example.com");
    assert.equal(isValidEmail("user@example.com"), true);
    assert.equal(isValidEmail("not-an-email"), false);
    assert.equal(isStrongPassword("Abcdef1!"), true);
    assert.equal(isStrongPassword("weakpass"), false);
    assert.equal(getPasswordResetExpiryMinutes(), 45);
  });
});
