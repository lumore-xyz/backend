import assert from "node:assert/strict";
import test from "node:test";
import {
  createLocationRoom,
  pinLocationRoom,
  rejoinLocationRoomPool,
  unpinLocationRoom,
} from "../controllers/locationRoom.controller.js";
import LocationRoomPin from "../models/locationRoomPin.model.js";
import LocationRoom from "../models/locationRoom.model.js";

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

const createLeanChain = (value) => ({
  select() {
    return this;
  },
  populate() {
    return this;
  },
  sort() {
    return this;
  },
  limit() {
    return this;
  },
  lean: async () => value,
});

const withRoomControllerMocks = async (
  {
    room = {
      _id: "room-1",
      title: "Indiranagar",
      description: "",
      creator: "user-1",
      status: "active",
      location: {
        type: "Point",
        coordinates: [77.6408, 12.9784],
        formattedAddress: "Indiranagar, Bengaluru",
      },
      nextMatchAt: new Date("2026-06-07T00:00:00.000Z"),
      createdAt: new Date("2026-06-06T00:00:00.000Z"),
      updatedAt: new Date("2026-06-06T00:00:00.000Z"),
    },
    pinState = {
      isPinned: true,
      inPool: true,
      poolStatus: "in_pool",
      lastMatchedAt: null,
      lastMatchedCycle: null,
      lastMatchRoom: null,
      lastPoolError: "",
    },
  } = {},
  fn,
) => {
  const originals = {
    roomCreate: LocationRoom.create,
    roomFindOne: LocationRoom.findOne,
    pinFindOneAndUpdate: LocationRoomPin.findOneAndUpdate,
    pinFindOne: LocationRoomPin.findOne,
    pinFind: LocationRoomPin.find,
    pinAggregate: LocationRoomPin.aggregate,
  };
  const calls = {
    createdRoom: null,
    pinUpdates: [],
  };

  LocationRoom.create = async (payload) => {
    calls.createdRoom = payload;
    return { ...room, ...payload, _id: room._id };
  };
  LocationRoom.findOne = () => createLeanChain(room);
  LocationRoomPin.findOneAndUpdate = async (filter, update) => {
    calls.pinUpdates.push({ filter, update });
    return { ...pinState, ...update.$set };
  };
  LocationRoomPin.findOne = () => createLeanChain(pinState);
  LocationRoomPin.find = () => createLeanChain([]);
  LocationRoomPin.aggregate = async () => [
    { _id: room._id, pinnedCount: 1, poolCount: 1 },
  ];

  try {
    await fn(calls);
  } finally {
    LocationRoom.create = originals.roomCreate;
    LocationRoom.findOne = originals.roomFindOne;
    LocationRoomPin.findOneAndUpdate = originals.pinFindOneAndUpdate;
    LocationRoomPin.findOne = originals.pinFindOne;
    LocationRoomPin.find = originals.pinFind;
    LocationRoomPin.aggregate = originals.pinAggregate;
  }
};

test("createLocationRoom requires a verified user", async () => {
  const req = {
    user: { _id: "user-1", isVerified: false, verificationStatus: "not_started" },
    body: { title: "Campus Room", latitude: 12.97, longitude: 77.59 },
  };
  const res = createRes();

  await createLocationRoom(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, "Verification is required to create rooms");
});

test("createLocationRoom creates a room and joins the creator to the pool", async () => {
  await withRoomControllerMocks({}, async (calls) => {
    const req = {
      user: { _id: "user-1", isVerified: true },
      body: {
        title: "Indiranagar",
        description: "Evening people nearby",
        latitude: 12.9784,
        longitude: 77.6408,
        formattedAddress: "Indiranagar, Bengaluru",
      },
    };
    const res = createRes();

    await createLocationRoom(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(calls.createdRoom.title, "Indiranagar");
    assert.deepEqual(calls.createdRoom.location.coordinates, [77.6408, 12.9784]);
    assert.equal(calls.pinUpdates[0].update.$set.isPinned, true);
    assert.equal(calls.pinUpdates[0].update.$set.inPool, true);
    assert.equal(res.body.userState.poolStatus, "in_pool");
  });
});

test("pin, rejoin, and unpin update pool state", async () => {
  await withRoomControllerMocks({}, async (calls) => {
    const baseReq = {
      user: { _id: "user-1" },
      params: { roomId: "room-1" },
    };

    await pinLocationRoom(baseReq, createRes());
    await rejoinLocationRoomPool(baseReq, createRes());
    await unpinLocationRoom(baseReq, createRes());

    assert.deepEqual(
      calls.pinUpdates.map((call) => ({
        isPinned: call.update.$set.isPinned,
        inPool: call.update.$set.inPool,
        poolStatus: call.update.$set.poolStatus,
      })),
      [
        { isPinned: true, inPool: true, poolStatus: "in_pool" },
        { isPinned: true, inPool: true, poolStatus: "in_pool" },
        { isPinned: false, inPool: false, poolStatus: "left" },
      ],
    );
  });
});
