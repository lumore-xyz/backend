import MatchRoom from "../models/room.model.js";
import UnlockHistory from "../models/unlock.model.js";
import { getOtherParticipantId } from "../utils/matchRoom.js";
import { idsEqual, isValidObjectId } from "../utils/objectId.js";
import { logError } from "../utils/logError.js";

const setProfileLock = async (socket, userId, { profileId, roomId }, unlocked) => {
  if (!isValidObjectId(roomId) || !isValidObjectId(profileId)) return;

  try {
    const room = await MatchRoom.findById(roomId)
      .select("participants")
      .lean();
    if (!room || !idsEqual(getOtherParticipantId(room, userId), profileId)) {
      return socket.emit("error", { message: "Not authorized for this chat" });
    }

    if (unlocked) {
      await UnlockHistory.findOneAndUpdate(
        { user: userId, unlockedUser: profileId },
        { unlockedAt: new Date() },
        { upsert: true },
      );
    } else {
      await UnlockHistory.deleteOne({ user: userId, unlockedUser: profileId });
    }

    const action = unlocked ? "Unlocked" : "Locked";
    socket.to(roomId).emit(`profile${action}`, {
      profileId,
      [`${unlocked ? "unlocked" : "locked"}By`]: userId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logError("Profile lock update failed", error);
    socket.emit("error", { message: "Unable to update profile lock" });
  }
};

export const registerProfileLockHandlers = (socket, userId) => {
  socket.on("unlockProfile", (data) =>
    setProfileLock(socket, userId, data || {}, true),
  );
  socket.on("lockProfile", (data) =>
    setProfileLock(socket, userId, data || {}, false),
  );
};
