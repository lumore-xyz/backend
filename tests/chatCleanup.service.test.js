import assert from "node:assert/strict";
import test from "node:test";
import Message from "../models/message.model.js";
import MatchRoom from "../models/room.model.js";
import {
  cleanupExpiredArchivedChats,
  getArchivedChatCleanupCutoff,
} from "../services/chatCleanup.service.js";

const NOW = new Date("2026-06-10T12:00:00.000Z");

const createLeanChain = (value) => ({
  select() {
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

const withCleanupMocks = async (
  {
    rooms = [],
    mediaMessages = [],
    deletedMessageCount = 0,
    deletedRoomCount = 0,
  },
  fn,
) => {
  const originalRoomFind = MatchRoom.find;
  const originalRoomDeleteMany = MatchRoom.deleteMany;
  const originalMessageFind = Message.find;
  const originalMessageDeleteMany = Message.deleteMany;
  const calls = {
    roomFindQuery: null,
    roomDeleteQuery: null,
    messageFindQuery: null,
    messageDeleteQuery: null,
  };

  MatchRoom.find = (query) => {
    calls.roomFindQuery = query;
    return createLeanChain(rooms);
  };
  MatchRoom.deleteMany = async (query) => {
    calls.roomDeleteQuery = query;
    return { deletedCount: deletedRoomCount };
  };
  Message.find = (query) => {
    calls.messageFindQuery = query;
    return createLeanChain(mediaMessages);
  };
  Message.deleteMany = async (query) => {
    calls.messageDeleteQuery = query;
    return { deletedCount: deletedMessageCount };
  };

  try {
    await fn(calls);
  } finally {
    MatchRoom.find = originalRoomFind;
    MatchRoom.deleteMany = originalRoomDeleteMany;
    Message.find = originalMessageFind;
    Message.deleteMany = originalMessageDeleteMany;
  }
};

test("cleanupExpiredArchivedChats deletes old archived rooms, messages, and media", async () => {
  const mediaDeletes = [];

  await withCleanupMocks(
    {
      rooms: [{ _id: "room-old" }],
      mediaMessages: [
        {
          _id: "message-image",
          messageType: "image",
          imagePublicId: "chat/image-old",
        },
        {
          _id: "message-audio",
          messageType: "audio",
          audioPublicId: "chat-audio/audio-old",
        },
      ],
      deletedMessageCount: 4,
      deletedRoomCount: 1,
    },
    async (calls) => {
      const result = await cleanupExpiredArchivedChats({
        now: NOW,
        batchSize: 10,
        deleteMediaFile: async (publicId, resourceType) => {
          mediaDeletes.push({ publicId, resourceType });
        },
      });

      assert.equal(result.scanned, 1);
      assert.equal(result.deletedRooms, 1);
      assert.equal(result.deletedMessages, 4);
      assert.equal(result.deletedImages, 1);
      assert.equal(result.deletedAudio, 1);
      assert.deepEqual(mediaDeletes, [
        { publicId: "chat/image-old", resourceType: "image" },
        { publicId: "chat-audio/audio-old", resourceType: "video" },
      ]);
      assert.deepEqual(calls.messageDeleteQuery, {
        roomId: { $in: ["room-old"] },
      });
      assert.deepEqual(calls.roomDeleteQuery, {
        _id: { $in: ["room-old"] },
        status: "archive",
      });
    },
  );
});

test("cleanupExpiredArchivedChats keeps active and recent archives out of cleanup", async () => {
  await withCleanupMocks({ rooms: [] }, async (calls) => {
    const result = await cleanupExpiredArchivedChats({ now: NOW });
    const cutoff = getArchivedChatCleanupCutoff(NOW);

    assert.equal(result.scanned, 0);
    assert.equal(calls.roomFindQuery.status, "archive");
    assert.ok(
      calls.roomFindQuery.$or.some(
        (condition) => condition.archivedAt?.$lte?.getTime() === cutoff.getTime(),
      ),
    );
    assert.ok(
      calls.roomFindQuery.$or.some(
        (condition) =>
          condition.archivedAt === null &&
          condition.updatedAt?.$lte?.getTime() === cutoff.getTime(),
      ),
    );
    assert.equal(calls.messageFindQuery, null);
    assert.equal(calls.messageDeleteQuery, null);
    assert.equal(calls.roomDeleteQuery, null);
  });
});
