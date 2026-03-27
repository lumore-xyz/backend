import assert from "node:assert/strict";
import test from "node:test";
import { refreshToken as refreshTokenController } from "../controllers/auth.controller.js";
import User from "../models/user.model.js";
import { generateRefreshToken } from "../services/authToken.service.js";

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

const createRes = () => {
  const res = {
    statusCode: 200,
    body: null,
  };

  res.status = (code) => {
    res.statusCode = code;
    return res;
  };

  res.json = (body) => {
    res.body = body;
    return res;
  };

  return res;
};

const withMockedFindById = async (implementation, fn) => {
  const originalFindById = User.findById;
  User.findById = implementation;

  try {
    await fn();
  } finally {
    User.findById = originalFindById;
  }
};

const tokenEnv = {
  ACCESS_TOKEN_SECRET: "test-access-secret",
  ACCESS_TOKEN_EXPIRY: "1d",
  REFRESH_TOKEN_SECRET: "test-refresh-secret",
  REFRESH_TOKEN_EXPIRY: "30d",
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
};

test("refreshToken returns 401 when no refresh token is provided", async () => {
  const req = { body: {}, query: {} };
  const res = createRes();

  await refreshTokenController(req, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, "No refresh token provided");
});

test("refreshToken returns a new access token for a valid refresh token", async () => {
  await withEnv(tokenEnv, async () => {
    const refreshToken = generateRefreshToken("user-123");
    const req = {
      body: { refreshToken },
      query: {},
    };
    const res = createRes();

    await withMockedFindById(async (id) => ({ _id: id }), async () => {
      await refreshTokenController(req, res);
    });

    assert.equal(res.statusCode, 200);
    assert.equal(typeof res.body.accessToken, "string");
    assert.notEqual(res.body.accessToken, refreshToken);
  });
});

test("refreshToken returns 403 for an invalid refresh token", async () => {
  await withEnv(tokenEnv, async () => {
    const req = {
      body: { refreshToken: "invalid-refresh-token" },
      query: {},
    };
    const res = createRes();

    await refreshTokenController(req, res);

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, "Invalid or expired refresh token");
  });
});

test("refreshToken returns 404 when the refresh token user does not exist", async () => {
  await withEnv(tokenEnv, async () => {
    const refreshToken = generateRefreshToken("missing-user");
    const req = {
      body: { refreshToken },
      query: {},
    };
    const res = createRes();

    await withMockedFindById(async () => null, async () => {
      await refreshTokenController(req, res);
    });

    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error, "User not found");
  });
});
