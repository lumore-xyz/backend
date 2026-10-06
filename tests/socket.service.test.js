import assert from "node:assert/strict";
import test from "node:test";
import MatchRoom from "../models/room.model.js";
import User from "../models/user.model.js";
import { handleConnection } from "../services/socket.service.js";

test("joinChat keeps the personal inbox room but rejects a chat where the user is not a participant", async () => {
  const originalFindRoom = MatchRoom.findById;
  const originalUpdateUser = User.updateOne;
  const handlers = new Map();
  const joinedRooms = [];
  MatchRoom.findById = () => ({ lean: async () => ({ participants: ["owner"], status: "active" }) });
  User.updateOne = async () => ({ acknowledged: true });

  const socket = {
    user: { _id: { toString: () => "attacker" } },
    id: "socket-1",
    on: (event, handler) => handlers.set(event, handler),
    use() {},
    join: (roomId) => joinedRooms.push(roomId),
    emit() {},
    leave() {},
    to: () => ({ emit() {} }),
    nsp: { to: () => ({ emit() {} }) },
  };

  try {
    handleConnection(socket);
    await handlers.get("joinChat")({ roomId: "64a000000000000000000001" });
    assert.deepEqual(joinedRooms, ["attacker"]);
  } finally {
    MatchRoom.findById = originalFindRoom;
    User.updateOne = originalUpdateUser;
  }
});
