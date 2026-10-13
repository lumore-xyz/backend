import assert from "node:assert/strict";
import test from "node:test";
import User from "../models/user.model.js";
import { authenticateGoogleUser } from "../services/auth.service.js";

test("Google sign-in does not link an identity to an underage email match", async (t) => {
  const underageUser = {
    dob: new Date("2015-01-01T00:00:00.000Z"),
    googleId: undefined,
    save: t.mock.fn(),
  };
  let lookupCount = 0;
  t.mock.method(User, "findOne", async () => {
    lookupCount += 1;
    return lookupCount === 1 ? null : underageUser;
  });

  const result = await authenticateGoogleUser({
    email: "member@example.com",
    sub: "google-subject",
    email_verified: true,
  });

  assert.deepEqual(result, { underage: true });
  assert.equal(underageUser.googleId, undefined);
  assert.equal(underageUser.save.mock.callCount(), 0);
});
