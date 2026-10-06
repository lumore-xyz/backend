import LocationRoom, {
  LOCATION_ROOM_MATCH_INTERVAL_MS,
} from "../models/locationRoom.model.js";
import LocationRoomCycle from "../models/locationRoomCycle.model.js";
import LocationRoomPin from "../models/locationRoomPin.model.js";
import User from "../models/user.model.js";
import { hasValidLocation } from "../utils/location.js";
import { LOCATION_ROOM_POOL_STATUS } from "../utils/locationRoomPool.js";
import { LOCATION_ROOM_CYCLE_STATUS } from "../utils/locationRoom.js";
import { selectRoomMatchPairs } from "./locationRoomPairing.service.js";
import { normalizePreference } from "./matchingPolicy.service.js";
import { buildCompatibilityEdges } from "./locationRoomCompatibility.service.js";
import { notifyLocationRoomPoolUpdated } from "./locationRoomNotification.service.js";
import { createRoomMatches } from "./locationRoomMatchCreation.service.js";
import { getPreferencesByUserIds } from "./profilePreference.service.js";
import { logError } from "../utils/logError.js";

const ROOM_MATCH_SELECT =
  "_id username nickname profilePicture gender dob bio interests languages religion diet lifestyle personalityType work institution fieldVisibility location credits isArchived";

const getFailureReason = (user) => {
  if (!user) return "user_not_found";
  if (user.isArchived) return "archived_user";
  if (!user.gender || !user.dob) return "missing_profile";
  if (!hasValidLocation(user?.location)) return "missing_location";
  return "";
};

export const runLocationRoomCycle = async ({ room, now = new Date() }) => {
  const cycle = await LocationRoomCycle.create({
    room: room._id,
    status: LOCATION_ROOM_CYCLE_STATUS.RUNNING,
    startedAt: now,
  });
  try {
    return await processLocationRoomCycle({ room, cycle, now });
  } catch (error) {
    cycle.status = LOCATION_ROOM_CYCLE_STATUS.FAILED;
    cycle.completedAt = new Date();
    cycle.error = "cycle_failed";
    try {
      await cycle.save();
    } catch (saveError) {
      logError("[location-room] failed to persist cycle failure", saveError);
    }
    throw error;
  }
};

const processLocationRoomCycle = async ({ room, cycle, now }) => {
  const pins = await LocationRoomPin.find({
    room: room._id,
    isPinned: true,
    inPool: true,
    poolStatus: LOCATION_ROOM_POOL_STATUS.IN_POOL,
  })
    .select("user")
    .lean();
  const poolUserIds = pins.map((pin) => pin.user);
  const users = await User.find({ _id: { $in: poolUserIds } })
    .select(ROOM_MATCH_SELECT)
    .lean();
  const userById = new Map(users.map((user) => [user._id.toString(), user]));
  const skippedUsers = [];
  const eligibleUsers = [];

  for (const userId of poolUserIds) {
    const user = userById.get(userId.toString());
    const reason = getFailureReason(user);
    if (reason) {
      skippedUsers.push({ user: userId, reason });
      continue;
    }
    eligibleUsers.push(user);
  }

  const preferenceDocByUser = await getPreferencesByUserIds(
    eligibleUsers.map((user) => user._id),
  );
  const prefsByUser = new Map(
    eligibleUsers.map((user) => [
      user._id.toString(),
      normalizePreference(preferenceDocByUser.get(user._id.toString()), {
        userGender: user.gender,
      }),
    ]),
  );
  const { edges, blockedPairKeys } = await buildCompatibilityEdges({
    room,
    cycle,
    users: eligibleUsers,
    prefsByUser,
    now,
  });
  const { selected, unmatchedUserIds } = selectRoomMatchPairs({
    edges,
    eligibleUserIds: eligibleUsers.map((user) => user._id),
    blockedPairKeys,
  });
  for (const userId of unmatchedUserIds) {
    skippedUsers.push({ user: userId, reason: "no_compatible_room_match" });
  }

  const created = await createRoomMatches({
    room,
    cycle,
    pairs: selected,
    now,
  });
  const completedAt = new Date();
  const nextMatchAt = new Date(
    completedAt.getTime() + LOCATION_ROOM_MATCH_INTERVAL_MS,
  );
  const matchedUserCount = created.matchedUserIds.size;
  const finalSkippedUsers = [...skippedUsers, ...created.skippedUsers];

  cycle.status = LOCATION_ROOM_CYCLE_STATUS.COMPLETED;
  cycle.completedAt = completedAt;
  cycle.nextMatchAt = nextMatchAt;
  cycle.poolUserCount = poolUserIds.length;
  cycle.eligibleUserCount = eligibleUsers.length;
  cycle.matchedUserCount = matchedUserCount;
  cycle.matchCount = created.matches.length;
  cycle.matches = created.matches;
  cycle.skippedUsers = finalSkippedUsers;
  await cycle.save();

  await LocationRoom.findByIdAndUpdate(room._id, {
    $set: {
      nextMatchAt,
      lastCycleAt: completedAt,
      isCycleLocked: false,
      cycleLockedAt: null,
    },
  });

  await notifyLocationRoomPoolUpdated({
    roomId: room._id,
    userIds: poolUserIds,
    nextMatchAt,
    matchedUserCount,
    matchCount: created.matches.length,
  });

  return {
    cycle,
    matchCount: created.matches.length,
    matchedUserCount,
    skippedUserCount: finalSkippedUsers.length,
  };
};
