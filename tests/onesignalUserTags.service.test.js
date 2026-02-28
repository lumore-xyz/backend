import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOneSignalProfileTags,
  extractLocationTags,
  syncUserProfileTagsToOneSignal,
} from "../services/onesignalUserTags.service.js";

const createEntitlementsTagLimitError = () => {
  const error = new Error("conflict");
  error.code = 409;
  error.body = {
    errors: [
      {
        code: "entitlements-tag-limit",
        title:
          "The tags for this user exceed the limit for this organization's plan.",
      },
    ],
  };
  return error;
};

test("buildOneSignalProfileTags maps only tracked fields", () => {
  const tags = buildOneSignalProfileTags({
    nickname: "kr",
    gender: "woman",
    username: "ignored",
    location: {
      formattedAddress:
        "Block A, Sector 3, Bengaluru, Bangalore Urban, Karnataka 560001, India",
    },
  });

  assert.deepEqual(tags, {
    nickname: "kr",
    gender: "woman",
    "location.country": "India",
  });
});

test("extractLocationTags parses city, country and pincode from formatted address", () => {
  const location = extractLocationTags(
    "Block A, Sector 3, Bengaluru, Bangalore Urban, Karnataka 560001, India",
  );

  assert.deepEqual(location, {
    city: "Bengaluru",
    country: "India",
    pincode: "560001",
  });
});

test("buildOneSignalProfileTags sets empty strings for missing tracked values", () => {
  const tags = buildOneSignalProfileTags({
    location: { formattedAddress: "" },
  });

  assert.deepEqual(tags, {
    nickname: "",
    gender: "",
    "location.country": "",
  });
});

test("syncUserProfileTagsToOneSignal skips when external_id is not found in OneSignal", async () => {
  let updateCalled = false;
  const mockClient = {
    async getUser() {
      const error = new Error("not found");
      error.code = 404;
      throw error;
    },
    async updateUser() {
      updateCalled = true;
    },
  };

  const result = await syncUserProfileTagsToOneSignal(
    { _id: "u404", nickname: "kr" },
    { appId: "app-id", client: mockClient },
  );

  assert.deepEqual(result, {
    skipped: true,
    reason: "user_not_found_in_onesignal",
  });
  assert.equal(updateCalled, false);
});

test("syncUserProfileTagsToOneSignal skips when OneSignal is not configured", async () => {
  const result = await syncUserProfileTagsToOneSignal(
    { _id: "u1" },
    { appId: "", client: null },
  );

  assert.deepEqual(result, {
    skipped: true,
    reason: "not_configured",
  });
});

test("syncUserProfileTagsToOneSignal skips when there are no tag changes", async () => {
  let updateCalled = false;
  const mockClient = {
    async getUser() {
      return {
        properties: {
          tags: {
            nickname: "kr",
            gender: "woman",
            "location.country": "India",
          },
        },
      };
    },
    async updateUser() {
      updateCalled = true;
    },
  };

  const result = await syncUserProfileTagsToOneSignal(
    {
      _id: "u1",
      nickname: "kr",
      gender: "woman",
      location: { formattedAddress: "Area, City, State 560001, India" },
    },
    { appId: "app-id", client: mockClient },
  );

  assert.deepEqual(result, {
    skipped: true,
    reason: "no_tag_changes",
  });
  assert.equal(updateCalled, false);
});

test("syncUserProfileTagsToOneSignal retries once on 409 and succeeds", async () => {
  let updateAttempts = 0;
  const mockClient = {
    async getUser() {
      return {
        id: "exists",
        properties: {
          tags: {
            nickname: "old-nick",
          },
        },
      };
    },
    async updateUser() {
      updateAttempts += 1;
      if (updateAttempts === 1) {
        const error = new Error("conflict");
        error.code = 409;
        throw error;
      }
      return { properties: { tags: {} } };
    },
  };

  const result = await syncUserProfileTagsToOneSignal(
    { _id: "u409", nickname: "new-nick" },
    { appId: "app-id", client: mockClient },
  );

  assert.deepEqual(result, { success: true });
  assert.equal(updateAttempts, 2);
});

test("syncUserProfileTagsToOneSignal skips after repeated 409 conflicts", async () => {
  let updateAttempts = 0;
  const mockClient = {
    async getUser() {
      return {
        id: "exists",
        properties: {
          tags: {
            nickname: "old-nick",
          },
        },
      };
    },
    async updateUser() {
      updateAttempts += 1;
      const error = new Error("conflict");
      error.code = 409;
      throw error;
    },
  };

  const result = await syncUserProfileTagsToOneSignal(
    { _id: "u409", nickname: "new-nick" },
    { appId: "app-id", client: mockClient },
  );

  assert.deepEqual(result, {
    skipped: true,
    reason: "conflict_409",
  });
  assert.equal(updateAttempts, 2);
});

test("syncUserProfileTagsToOneSignal partially applies focused tags under entitlement limit", async () => {
  const updateCalls = [];
  const mockClient = {
    async getUser() {
      return {
        id: "exists",
        properties: {
          tags: {},
        },
      };
    },
    async updateUser(_appId, _aliasLabel, _aliasId, updateRequest) {
      const tags = updateRequest?.properties?.tags || {};
      const keys = Object.keys(tags);
      updateCalls.push(keys);

      // First call is full patch and should fail.
      if (updateCalls.length === 1) {
        throw createEntitlementsTagLimitError();
      }

      // Allow nickname + gender, then block country.
      if (keys[0] === "location.country") {
        throw createEntitlementsTagLimitError();
      }

      return { properties: { tags } };
    },
  };

  const result = await syncUserProfileTagsToOneSignal(
    {
      _id: "u-limit",
      nickname: "kr",
      gender: "woman",
      location: {
        formattedAddress: "Some Area, Bengaluru, Karnataka 560001, India",
      },
    },
    { appId: "app-id", client: mockClient },
  );

  assert.equal(result.success, true);
  assert.equal(result.partial, true);
  assert.equal(result.reason, "entitlements_tag_limit_partial");
  assert.deepEqual(result.appliedKeys, ["nickname", "gender"]);
  assert.equal(result.blockedKey, "location.country");
  assert.equal(updateCalls.length, 4);
});

