import {
  getLocationRoomUserState,
  updateLocationRoomPool,
  unpinLocationRoom as removeLocationRoomPin,
} from "../services/locationRoomPool.service.js";
import { LOCATION_ROOM_POOL_STATUS } from "../utils/locationRoomPool.js";

const setPoolState = (state) => async (req, res) => {
  const roomId = req.params.roomId;
  const userId = req.user._id;
  const room = await updateLocationRoomPool({ roomId, userId, state });

  if (!room) return res.status(404).json({ message: "Room not found" });
  if (room === "private") {
    return res.status(403).json({ message: "This room is private" });
  }

  return res.status(200).json({
    userState: await getLocationRoomUserState({ roomId, userId }),
  });
};

const activePoolState = {
  isPinned: true,
  inPool: true,
  poolStatus: LOCATION_ROOM_POOL_STATUS.IN_POOL,
  lastPoolError: "",
};

export const pinLocationRoom = setPoolState(activePoolState);
export const rejoinLocationRoomPool = pinLocationRoom;
export const leaveLocationRoomPool = setPoolState({
  isPinned: true,
  inPool: false,
  poolStatus: LOCATION_ROOM_POOL_STATUS.LEFT,
  lastPoolError: "",
});

export const unpinLocationRoom = async (req, res) => {
  const roomId = req.params.roomId;
  const userId = req.user._id;
  const result = await removeLocationRoomPin({ roomId, userId });
  if (result.error === "ROOM_NOT_FOUND") {
    return res.status(404).json({ message: "Room not found" });
  }
  if (result.error === "PRIVATE_ROOM") {
    return res.status(403).json({ message: "This room is private" });
  }

  return res.status(200).json({ userState: result.userState });
};
