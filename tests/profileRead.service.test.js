import assert from "node:assert/strict";
import test from "node:test";
import UnlockHistory from "../models/unlock.model.js";
import User from "../models/user.model.js";
import UserPhotos from "../models/userPhotos.model.js";
import { getProfileData } from "../services/profileRead.service.js";

test("getProfileData exposes only public and unlocked fields and hides credentials", async () => {
  const originals = {
    findById: User.findById,
    findUnlocks: UnlockHistory.find,
    findPhotos: UserPhotos.find,
  };
  const profile = {
    _id: "profile-id",
    location: { type: "Point", coordinates: [-73, 40] },
    fieldVisibility: { nickname: "public", bio: "private", realName: "unlocked" },
    nickname: "Alex",
    bio: "private bio",
    realName: "Alex Example",
    password: "secret",
    credits: 99,
    lastDailyCreditAt: new Date(),
    explorePayment: { status: "paid" },
  };
  const viewer = {
    location: { type: "Point", coordinates: [-73, 40] },
  };
  let photoQueries = 0;
  User.findById = (id) => ({
    lean() { return this; },
    select() { return Promise.resolve(id === "profile-id" ? profile : viewer); },
  });
  UnlockHistory.find = () => ({
    select() { return this; },
    lean: async () => [{ user: "profile-id" }],
  });
  UserPhotos.find = () => {
    photoQueries += 1;
    return {
      select() { return this; },
      lean: async () => [{ photoUrl: "photo-url" }],
    };
  };

  try {
    const data = await getProfileData({ userId: "profile-id", viewerId: "viewer-id" });
    assert.equal(data.nickname, "Alex");
    assert.equal(data.bio, undefined);
    assert.equal(data.realName, "Alex Example");
    assert.equal(data.password, undefined);
    assert.equal(data.credits, undefined);
    assert.equal(data.explorePayment, undefined);
    assert.deepEqual(data.photos, [{ photoUrl: "photo-url" }]);
    assert.equal(photoQueries, 1);
  } finally {
    User.findById = originals.findById;
    UnlockHistory.find = originals.findUnlocks;
    UserPhotos.find = originals.findPhotos;
  }
});
