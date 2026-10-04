import LocationRoom from "../models/locationRoom.model.js";
import { logError } from "../utils/logError.js";
import {
  LOCATION_ROOM_STATUS,
} from "../utils/locationRoom.js";
import { runLocationRoomCycle } from "./locationRoomMatching.service.js";

const ROOM_CYCLE_LOCK_STALE_MS = 15 * 60 * 1000;
const ROOM_CYCLE_RETRY_MS = 15 * 60 * 1000;
export const processDueLocationRoomCycle = async ({
  roomId,
  now = new Date(),
  ignoreSchedule = false,
}) => {
  const staleLockBefore = new Date(now.getTime() - ROOM_CYCLE_LOCK_STALE_MS);
  const room = await LocationRoom.findOneAndUpdate(
    {
      _id: roomId,
      status: LOCATION_ROOM_STATUS.ACTIVE,
      ...(ignoreSchedule ? {} : { nextMatchAt: { $lte: now } }),
      $or: [
        { isCycleLocked: { $ne: true } },
        { cycleLockedAt: { $lt: staleLockBefore } },
      ],
    },
    {
      $set: {
        isCycleLocked: true,
        cycleLockedAt: now,
      },
    },
    { returnDocument: "after" },
  );
  if (!room) return { skipped: true, reason: "not_due_or_locked" };

  try {
    return await runLocationRoomCycle({ room, now });
  } catch (error) {
    logError("[location-room] cycle_failed", error);
    const retryAt = new Date(Date.now() + ROOM_CYCLE_RETRY_MS);
    try {
      await LocationRoom.findByIdAndUpdate(room._id, {
        $set: {
          nextMatchAt: retryAt,
          isCycleLocked: false,
          cycleLockedAt: null,
        },
      });
    } catch (updateError) {
      logError("[location-room] failed to schedule cycle retry", updateError);
    }
    throw error;
  }
};

export const runDueLocationRoomCycles = async ({
  now = new Date(),
} = {}) => {
  const rooms = await LocationRoom.find({
    status: LOCATION_ROOM_STATUS.ACTIVE,
    nextMatchAt: { $lte: now },
  })
    .select("_id")
    .sort({ nextMatchAt: 1 })
    .lean();

  const results = [];
  for (const room of rooms) {
    try {
      results.push(
        await processDueLocationRoomCycle({ roomId: room._id, now }),
      );
    } catch (error) {
      results.push({ success: false, roomId: room._id, reason: "cycle_failed" });
    }
  }
  return {
    scanned: rooms.length,
    processed: results.filter((result) => !result?.skipped).length,
    results,
  };
};

