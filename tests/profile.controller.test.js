import assert from "node:assert/strict";
import test from "node:test";
import {
  createUpdateProfile,
  updateUserLocation,
} from "../controllers/profile.controller.js";
import User from "../models/user.model.js";

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

test("createUpdateProfile rejects raw location writes on the generic profile endpoint", async () => {
  const originalFindByIdAndUpdate = User.findByIdAndUpdate;
  let wasCalled = false;
  User.findByIdAndUpdate = async () => {
    wasCalled = true;
    return null;
  };

  try {
    const req = {
      user: { id: "user-1" },
      body: {
        location: {
          type: "Point",
          coordinates: [77.5946, 12.9716],
          formattedAddress: "Bengaluru, Karnataka 560001, India",
        },
      },
    };
    const res = createRes();

    await createUpdateProfile(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(
      res.body.message,
      "Location updates must use POST /profile/:userId/update-location",
    );
    assert.equal(wasCalled, false);
  } finally {
    User.findByIdAndUpdate = originalFindByIdAndUpdate;
  }
});

test("updateUserLocation responds with canonical coordinates and echoed latitude longitude", async () => {
  const user = new User({
    username: "profile-controller-location-user",
    location: {
      type: "Point",
      coordinates: [77.5946, 12.9716],
      formattedAddress: "Old Area, Bengaluru, Karnataka 560001, India",
    },
  });
  const originalSave = user.save;
  const originalFindById = User.findById;

  user.save = async function saveStub() {
    return this;
  };
  User.findById = async () => user;

  try {
    const req = {
      user: { id: "user-1" },
      body: {
        latitude: 12.9721,
        longitude: 77.5933,
        formattedAddress: "New Area, Bengaluru, Karnataka 560001, India",
      },
    };
    const res = createRes();

    await updateUserLocation(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.data.location.coordinates, [77.5933, 12.9721]);
    assert.equal(res.body.data.latitude, 12.9721);
    assert.equal(res.body.data.longitude, 77.5933);
  } finally {
    user.save = originalSave;
    User.findById = originalFindById;
  }
});
