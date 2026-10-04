import LocationRoom from "../models/locationRoom.model.js";
import { idsEqual } from "../utils/objectId.js";
import { LOCATION_ROOM_STATUS } from "../utils/locationRoom.js";

export const getActiveLocationRoom = ({ roomId }) =>
  LocationRoom.findOne({
    _id: roomId,
    status: LOCATION_ROOM_STATUS.ACTIVE,
  }).lean();

export const getManageableActiveLocationRoom = async ({ roomId, user }) => {
  const room = await getActiveLocationRoom({ roomId });

  if (!room) return { error: "ROOM_NOT_FOUND" };
  if (!user?.isAdmin && !idsEqual(room.creator, user?._id)) {
    return { error: "FORBIDDEN" };
  }

  return { room };
};
