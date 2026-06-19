import assert from "node:assert/strict";
import test from "node:test";
import {
  applyVerificationAutoRevoke,
  detectChangedIdentityFields,
  IDENTITY_REVOKE_FIELDS,
} from "../services/verificationAutoRevoke.service.js";

const buildUpdateOneMock = () => {
  const calls = [];
  const updateOne = (filter, update) => {
    calls.push({ filter, update });
    return Promise.resolve({ acknowledged: true });
  };
  return { updateOne, calls };
}

test("detectChangedIdentityFields flags profile picture, dob, gender, religion", () => {
  const previous = {
    profilePicture: "https://cdn/old.jpg",
    dob: new Date("2000-01-01"),
    gender: "man",
    religion: "Hindu",
  };
  const next = {
    profilePicture: "https://cdn/new.jpg",
    dob: new Date("2000-02-01"),
    gender: "woman",
    religion: "Christian",
    bio: "ignored",
  };
  const changed = detectChangedIdentityFields(previous, next);
  assert.deepEqual(changed.sort(), [
    "dob",
    "gender",
    "profilePicture",
    "religion",
  ]);
});

test("detectChangedIdentityFields ignores non-identity fields even if changed", () => {
  const changed = detectChangedIdentityFields(
    { bio: "old", nickname: "old" },
    { bio: "new", nickname: "new", profilePicture: "x" },
  );
  assert.deepEqual(changed, ["profilePicture"]);
});

test("detectChangedIdentityFields is case-insensitive and trims strings", () => {
  const previous = { gender: "MAN", religion: "Hindu" };
  const next = { gender: "  man ", religion: "hindu " };
  assert.deepEqual(detectChangedIdentityFields(previous, next), []);
});

test("detectChangedIdentityFields treats Date equality by timestamp", () => {
  const a = new Date("2024-05-12T10:00:00Z");
  const b = new Date(a.getTime());
  assert.deepEqual(
    detectChangedIdentityFields({ dob: a }, { dob: b }),
    [],
  );
});

test("applyVerificationAutoRevoke no-ops when no identity field changed", async () => {
  const { updateOne, calls } = buildUpdateOneMock();
  const result = await applyVerificationAutoRevoke({
    userId: "u1",
    previousUser: {
      profilePicture: "x",
      dob: new Date("2000-01-01"),
      gender: "man",
      religion: "Hindu",
      isVerified: true,
      verificationStatus: "approved",
    },
    nextPatch: { bio: "new bio", nickname: "new nick" },
    userModel: { updateOne },
    logger: { info: () => {} },
  });
  assert.equal(result.revoked, false);
  assert.deepEqual(result.changedFields, []);
  assert.equal(calls.length, 0);
});

test("applyVerificationAutoRevoke skips DB write when user is not verified", async () => {
  const { updateOne, calls } = buildUpdateOneMock();
  const result = await applyVerificationAutoRevoke({
    userId: "u1",
    previousUser: {
      profilePicture: "x",
      isVerified: false,
      verificationStatus: "not_started",
    },
    nextPatch: { profilePicture: "y" },
    userModel: { updateOne },
    logger: { info: () => {} },
  });
  assert.equal(result.revoked, false);
  assert.equal(result.wasVerified, false);
  assert.deepEqual(result.changedFields, ["profilePicture"]);
  assert.equal(calls.length, 0);
});

test("applyVerificationAutoRevoke revokes when verified user changes profile picture", async () => {
  const { updateOne, calls } = buildUpdateOneMock();
  const result = await applyVerificationAutoRevoke({
    userId: "u1",
    previousUser: {
      profilePicture: "old",
      isVerified: true,
      verificationStatus: "approved",
      verificationMethod: "didit",
      verificationSessionId: "sess-123",
    },
    nextPatch: { profilePicture: "new" },
    userModel: { updateOne },
    logger: { info: () => {} },
  });
  assert.equal(result.revoked, true);
  assert.equal(result.wasVerified, true);
  assert.deepEqual(result.changedFields, ["profilePicture"]);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].filter, { _id: "u1" });
  assert.deepEqual(calls[0].update, {
    $set: {
      isVerified: false,
      verificationStatus: "not_started",
      verificationMethod: null,
      verificationSessionId: null,
    },
  });
});

test("applyVerificationAutoRevoke revokes on any of the four identity fields", async () => {
  for (const field of IDENTITY_REVOKE_FIELDS) {
    const { updateOne, calls } = buildUpdateOneMock();
    const previous = {
      isVerified: true,
      verificationStatus: "approved",
      profilePicture: "p",
      dob: new Date("2000-01-01"),
      gender: "man",
      religion: "Hindu",
    };
    const next = { ...previous };
    if (field === "profilePicture") next.profilePicture = "new";
    if (field === "dob") next.dob = new Date("2001-01-01");
    if (field === "gender") next.gender = "woman";
    if (field === "religion") next.religion = "Christian";

    const result = await applyVerificationAutoRevoke({
      userId: "u1",
      previousUser: previous,
      nextPatch: next,
      userModel: { updateOne },
      logger: { info: () => {} },
    });

    assert.equal(result.revoked, true, `expected revoke for ${field}`);
    assert.deepEqual(result.changedFields, [field]);
    assert.equal(calls.length, 1, `expected DB write for ${field}`);
  }
});

test("applyVerificationAutoRevoke accepts status='approved' even when isVerified is false", async () => {
  const { updateOne, calls } = buildUpdateOneMock();
  const result = await applyVerificationAutoRevoke({
    userId: "u1",
    previousUser: {
      isVerified: false,
      verificationStatus: "approved",
      profilePicture: "old",
    },
    nextPatch: { profilePicture: "new" },
    userModel: { updateOne },
    logger: { info: () => {} },
  });
  assert.equal(result.revoked, true);
  assert.equal(calls.length, 1);
});

test("applyVerificationAutoRevoke no-ops when called with invalid input", async () => {
  const { updateOne, calls } = buildUpdateOneMock();
  const logger = { info: () => {} };
  const r1 = await applyVerificationAutoRevoke({
    userId: "",
    previousUser: { profilePicture: "a" },
    nextPatch: { profilePicture: "b" },
    userModel: { updateOne },
    logger,
  });
  const r2 = await applyVerificationAutoRevoke({
    userId: "u1",
    previousUser: null,
    nextPatch: { profilePicture: "b" },
    userModel: { updateOne },
    logger,
  });
  const r3 = await applyVerificationAutoRevoke({
    userId: "u1",
    previousUser: { profilePicture: "a" },
    nextPatch: null,
    userModel: { updateOne },
    logger,
  });
  assert.equal(r1.revoked, false);
  assert.equal(r2.revoked, false);
  assert.equal(r3.revoked, false);
  assert.equal(calls.length, 0);
});

test("applyVerificationAutoRevoke propagates DB errors so the API fails loudly", async () => {
  const failingUpdateOne = () =>
    Promise.reject(new Error("db down"));
  const logger = {
    info: () => {},
    error: () => {},
  };
  await assert.rejects(
    applyVerificationAutoRevoke({
      userId: "u1",
      previousUser: {
        profilePicture: "old",
        isVerified: true,
        verificationStatus: "approved",
      },
      nextPatch: { profilePicture: "new" },
      userModel: { updateOne: failingUpdateOne },
      logger,
    }),
    /db down/,
  );
});
