import assert from "node:assert/strict";
import test from "node:test";
import {
  createLocationRoom,
  createStartLocationRoomMatchNow,
  getNearbyLocationRooms,
  leaveLocationRoomPool,
  pinLocationRoom,
  rejoinLocationRoomPool,
  unpinLocationRoom,
  updateLocationRoom,
} from "../controllers/locationRoom.controller.js";
import LocationRoomPin from "../models/locationRoomPin.model.js";
import LocationRoom from "../models/locationRoom.model.js";

const DAY_MS = 24 * 60 * 60 * 1000;

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
      visibility: "public",
      imageUrl: "",
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
    roomAggregate: LocationRoom.aggregate,
    roomFindOne: LocationRoom.findOne,
    roomFindByIdAndUpdate: LocationRoom.findByIdAndUpdate,
    pinFindOneAndUpdate: LocationRoomPin.findOneAndUpdate,
    pinFindOne: LocationRoomPin.findOne,
    pinFind: LocationRoomPin.find,
    pinAggregate: LocationRoomPin.aggregate,
  };
  const calls = {
    createdRoom: null,
    roomUpdates: [],
    pinUpdates: [],
  };

  LocationRoom.create = async (payload) => {
    calls.createdRoom = payload;
    return { ...room, ...payload, _id: room._id };
  };
  LocationRoom.findOne = () => createLeanChain(room);
  LocationRoom.findByIdAndUpdate = async (roomId, update) => {
    calls.roomUpdates.push({ roomId, update });
    return { ...room, ...update.$set, _id: room._id };
  };
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
    LocationRoom.aggregate = originals.roomAggregate;
    LocationRoom.findOne = originals.roomFindOne;
    LocationRoom.findByIdAndUpdate = originals.roomFindByIdAndUpdate;
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
    const before = Date.now();
    const req = {
      user: { _id: "user-1", isVerified: true },
      body: {
        title: "Indiranagar",
        description: "Evening people nearby",
        status: "private",
        latitude: 12.9784,
        longitude: 77.6408,
        formattedAddress: "Indiranagar, Bengaluru",
      },
    };
    const res = createRes();

    await createLocationRoom(req, res);
    const after = Date.now();

    assert.equal(res.statusCode, 201);
    assert.equal(calls.createdRoom.title, "Indiranagar");
    assert.equal(calls.createdRoom.visibility, "private");
    assert.deepEqual(calls.createdRoom.location.coordinates, [77.6408, 12.9784]);
    assert.ok(calls.createdRoom.nextMatchAt instanceof Date);
    assert.ok(calls.createdRoom.nextMatchAt.getTime() >= before + DAY_MS);
    assert.ok(calls.createdRoom.nextMatchAt.getTime() <= after + DAY_MS);
    assert.equal(calls.pinUpdates[0].update.$set.isPinned, true);
    assert.equal(calls.pinUpdates[0].update.$set.inPool, true);
    assert.equal(res.body.userState.poolStatus, "in_pool");
    assert.equal(res.body.room.visibility, "private");
  });
});

test("getNearbyLocationRooms lists public rooms ranked by distance and pool size", async () => {
  const baseRoom = {
    title: "Room",
    description: "",
    creator: "user-1",
    status: "active",
    visibility: "public",
    imageUrl: "",
    location: {
      type: "Point",
      coordinates: [77.6408, 12.9784],
      formattedAddress: "Bengaluru",
    },
    nextMatchAt: new Date("2026-06-07T00:00:00.000Z"),
    createdAt: new Date("2026-06-06T00:00:00.000Z"),
    updatedAt: new Date("2026-06-06T00:00:00.000Z"),
  };
  const rooms = [
    { ...baseRoom, _id: "near-empty", title: "Near Empty", distanceMeters: 500 },
    { ...baseRoom, _id: "busy-nearby", title: "Busy Nearby", distanceMeters: 900 },
    { ...baseRoom, _id: "far-busy", title: "Far Busy", distanceMeters: 3000 },
  ];
  let aggregatePipeline = null;
  const originals = {
    roomAggregate: LocationRoom.aggregate,
    pinAggregate: LocationRoomPin.aggregate,
    pinFind: LocationRoomPin.find,
  };

  LocationRoom.aggregate = async (pipeline) => {
    aggregatePipeline = pipeline;
    return rooms;
  };
  LocationRoomPin.aggregate = async () => [
    { _id: "near-empty", pinnedCount: 0, poolCount: 0 },
    { _id: "busy-nearby", pinnedCount: 7, poolCount: 7 },
    { _id: "far-busy", pinnedCount: 20, poolCount: 20 },
  ];
  LocationRoomPin.find = () => createLeanChain([]);

  try {
    const req = {
      user: { _id: "viewer-1" },
      query: { latitude: 12.9784, longitude: 77.6408, radiusKm: 10 },
      body: {},
    };
    const res = createRes();

    await getNearbyLocationRooms(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.rooms.map((room) => room._id), [
      "busy-nearby",
      "near-empty",
      "far-busy",
    ]);
    assert.deepEqual(aggregatePipeline[0].$geoNear.query, {
      status: "active",
      $or: [
        { visibility: "public" },
        { visibility: { $exists: false } },
        { visibility: null },
      ],
    });
    assert.equal(res.body.rooms[0].poolCount, 7);
  } finally {
    LocationRoom.aggregate = originals.roomAggregate;
    LocationRoomPin.aggregate = originals.pinAggregate;
    LocationRoomPin.find = originals.pinFind;
  }
});

test("pin, rejoin, leave pool, and unpin update pool state", async () => {
  await withRoomControllerMocks({}, async (calls) => {
    const baseReq = {
      user: { _id: "user-1" },
      params: { roomId: "room-1" },
    };

    await pinLocationRoom(baseReq, createRes());
    await rejoinLocationRoomPool(baseReq, createRes());
    await leaveLocationRoomPool(baseReq, createRes());
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
        { isPinned: true, inPool: false, poolStatus: "left" },
        { isPinned: false, inPool: false, poolStatus: "left" },
      ],
    );
  });
});

test("updateLocationRoom lets the creator edit room details", async () => {
  await withRoomControllerMocks({}, async (calls) => {
    const req = {
      user: { _id: "user-1", isAdmin: false },
      params: { roomId: "room-1" },
      body: {
        title: "Updated Room",
        description: "Fresh room description",
      },
    };
    const res = createRes();

    await updateLocationRoom(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(calls.roomUpdates.length, 1);
    assert.equal(calls.roomUpdates[0].roomId, "room-1");
    assert.equal(calls.roomUpdates[0].update.$set.title, "Updated Room");
    assert.equal(
      calls.roomUpdates[0].update.$set.description,
      "Fresh room description",
    );
    assert.equal(res.body.room.title, "Updated Room");
    assert.equal(res.body.room.description, "Fresh room description");
  });
});

test("updateLocationRoom blocks users who are not the creator or an admin", async () => {
  await withRoomControllerMocks({}, async (calls) => {
    const req = {
      user: { _id: "user-2", isAdmin: false },
      params: { roomId: "room-1" },
      body: {
        title: "Updated Room",
      },
    };
    const res = createRes();

    await updateLocationRoom(req, res);

    assert.equal(res.statusCode, 403);
    assert.equal(
      res.body.message,
      "Only the room creator or an admin can edit this room",
    );
    assert.equal(calls.roomUpdates.length, 0);
  });
});

test("startLocationRoomMatchNow lets the room creator trigger matching early", async () => {
  const room = {
    _id: "room-1",
    creator: "user-1",
    status: "active",
  };
  const processCalls = [];
  const startLocationRoomMatchNow = createStartLocationRoomMatchNow({
    processCycle: async (payload) => {
      processCalls.push(payload);
      return {
        cycle: { nextMatchAt: new Date("2026-06-09T00:00:00.000Z") },
        matchCount: 2,
        matchedUserCount: 4,
        skippedUserCount: 1,
      };
    },
  });
  const originalFindOne = LocationRoom.findOne;
  LocationRoom.findOne = () => createLeanChain(room);

  try {
    const req = {
      user: { _id: "user-1", isAdmin: false },
      params: { roomId: "room-1" },
    };
    const res = createRes();

    await startLocationRoomMatchNow(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(processCalls.length, 1);
    assert.equal(processCalls[0].roomId, "room-1");
    assert.equal(processCalls[0].ignoreSchedule, true);
    assert.ok(processCalls[0].now instanceof Date);
    assert.equal(res.body.matchCount, 2);
    assert.equal(res.body.matchedUserCount, 4);
    assert.equal(res.body.skippedUserCount, 1);
  } finally {
    LocationRoom.findOne = originalFindOne;
  }
});

test("startLocationRoomMatchNow blocks users who are not the creator or an admin", async () => {
  const room = {
    _id: "room-1",
    creator: "user-1",
    status: "active",
  };
  let processCalled = false;
  const startLocationRoomMatchNow = createStartLocationRoomMatchNow({
    processCycle: async () => {
      processCalled = true;
      return null;
    },
  });
  const originalFindOne = LocationRoom.findOne;
  LocationRoom.findOne = () => createLeanChain(room);

  try {
    const req = {
      user: { _id: "user-2", isAdmin: false },
      params: { roomId: "room-1" },
    };
    const res = createRes();

    await startLocationRoomMatchNow(req, res);

    assert.equal(res.statusCode, 403);
    assert.equal(
      res.body.message,
      "Only the room creator or an admin can start matching early",
    );
    assert.equal(processCalled, false);
  } finally {
    LocationRoom.findOne = originalFindOne;
  }
});
