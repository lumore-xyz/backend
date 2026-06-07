import LocationRoom, {
  LOCATION_ROOM_MATCH_INTERVAL_MS,
} from "../models/locationRoom.model.js";
import LocationRoomCycle from "../models/locationRoomCycle.model.js";
import LocationRoomPin from "../models/locationRoomPin.model.js";
import UserPreference from "../models/preference.model.js";
import MatchRoom from "../models/room.model.js";
import ThisOrThatAnswer from "../models/thisOrThatAnswer.model.js";
import User from "../models/user.model.js";
import {
  calculateDistanceMeters,
  getGeoPointFromLocation,
} from "../utils/location.js";
import {
  CREDIT_RULES,
  spendCreditsForConversationStart,
} from "./credits.service.js";
import { getOrCreateMatchRoom } from "./matching.service.js";
import {
  getHardEligibilityResult,
  normalizePreference,
  scoreCandidate,
} from "./matchmaking.service.js";
import { sendNotificationToUser } from "./push.service.js";
import socketService from "./socket.service.js";

export const ROOM_MIN_COMPATIBILITY_SCORE = 35;
const ROOM_CYCLE_LOCK_STALE_MS = 15 * 60 * 1000;
const ROOM_CYCLE_RETRY_MS = 15 * 60 * 1000;
const ROOM_MATCH_SELECT =
  "_id username nickname profilePicture gender dob interests languages religion diet lifestyle personalityType location credits isArchived";

const getId = (value) => value?._id?.toString?.() || value?.toString?.() || "";

const getPairKey = (userId1, userId2) =>
  [getId(userId1), getId(userId2)].sort().join(":");

const hasValidLocation = (user) =>
  Boolean(getGeoPointFromLocation(user?.location));

const isProfileEligibleForRoom = (user) =>
  Boolean(
    user &&
    !user.isArchived &&
    user.credits >= CREDIT_RULES.CONVERSATION_COST &&
    user.gender &&
    user.dob &&
    hasValidLocation(user),
  );

const getFailureReason = (user) => {
  if (!user) return "user_not_found";
  if (user.isArchived) return "archived_user";
  if (user.credits < CREDIT_RULES.CONVERSATION_COST)
    return "insufficient_credits";
  if (!user.gender || !user.dob) return "missing_profile";
  if (!hasValidLocation(user)) return "missing_location";
  return "";
};

const getAnswersByUser = async (userIds) => {
  const answers = await ThisOrThatAnswer.find({
    userId: { $in: userIds },
  })
    .select("userId questionId selection")
    .lean();

  const byUser = new Map();
  for (const answer of answers) {
    const userId = answer.userId.toString();
    if (!byUser.has(userId)) byUser.set(userId, new Map());
    byUser.get(userId).set(answer.questionId.toString(), answer.selection);
  }
  return byUser;
};

const getExistingActivePairSet = async ({ roomId, userIds }) => {
  const existingRooms = await MatchRoom.find({
    source: "location_room",
    locationRoom: roomId,
    status: "active",
    participants: { $in: userIds },
  })
    .select("participants")
    .lean();

  const pairSet = new Set();
  for (const room of existingRooms) {
    if (room.participants?.length !== 2) continue;
    pairSet.add(getPairKey(room.participants[0], room.participants[1]));
  }
  return pairSet;
};

const getDistanceMetersBetweenUsers = (userA, userB) => {
  const pointA = getGeoPointFromLocation(userA?.location);
  const pointB = getGeoPointFromLocation(userB?.location);
  return calculateDistanceMeters(pointA, pointB) || 0;
};

const buildRoomMatchingNote = ({
  room,
  cycle,
  score,
  seekerScore,
  candidateScore,
}) => ({
  version: "location_room",
  source: "location_room",
  locationRoomId: room._id.toString(),
  locationRoomTitle: room.title,
  locationRoomCycleId: cycle._id.toString(),
  totalScore: Math.round(score * 100) / 100,
  components: {
    seekerScore: Math.round(seekerScore.totalScore * 100) / 100,
    candidateScore: Math.round(candidateScore.totalScore * 100) / 100,
  },
  reasons: ["room_pool_compatibility", "mutual_preferences"],
});

const buildRoomMatchPayload = ({
  room,
  matchRoom,
  matchedUserId,
  matchingNote,
}) => ({
  roomId: matchRoom._id.toString(),
  chatRoomId: matchRoom._id.toString(),
  matchedUser: matchedUserId.toString(),
  matchedUserId: matchedUserId.toString(),
  locationRoom: {
    _id: room._id.toString(),
    title: room.title,
  },
  matchingNote,
});

export const selectRoomMatchPairs = ({
  edges,
  eligibleUserIds = [],
  maxMatchesPerUser = 2,
}) => {
  const sortedEdges = [...(edges || [])].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return getPairKey(a.userId1, a.userId2).localeCompare(
      getPairKey(b.userId1, b.userId2),
    );
  });
  const userIds = new Set(
    (eligibleUserIds || []).map((userId) => getId(userId)).filter(Boolean),
  );
  for (const edge of sortedEdges) {
    userIds.add(getId(edge.userId1));
    userIds.add(getId(edge.userId2));
  }

  const matchCounts = new Map(Array.from(userIds).map((userId) => [userId, 0]));
  const usedPairs = new Set();
  const selected = [];

  const selectEdge = (edge) => {
    const userId1 = getId(edge.userId1);
    const userId2 = getId(edge.userId2);
    const pairKey = getPairKey(userId1, userId2);
    if (usedPairs.has(pairKey)) return false;
    selected.push(edge);
    usedPairs.add(pairKey);
    matchCounts.set(userId1, (matchCounts.get(userId1) || 0) + 1);
    matchCounts.set(userId2, (matchCounts.get(userId2) || 0) + 1);
    return true;
  };

  for (const edge of sortedEdges) {
    const userId1 = getId(edge.userId1);
    const userId2 = getId(edge.userId2);
    if (
      (matchCounts.get(userId1) || 0) === 0 &&
      (matchCounts.get(userId2) || 0) === 0
    ) {
      selectEdge(edge);
    }
  }

  for (const userId of userIds) {
    if ((matchCounts.get(userId) || 0) > 0) continue;
    const edge = sortedEdges.find((candidate) => {
      const userId1 = getId(candidate.userId1);
      const userId2 = getId(candidate.userId2);
      if (usedPairs.has(getPairKey(userId1, userId2))) return false;
      if (userId1 !== userId && userId2 !== userId) return false;
      const otherUserId = userId1 === userId ? userId2 : userId1;
      return (
        (matchCounts.get(otherUserId) || 0) > 0 &&
        (matchCounts.get(otherUserId) || 0) < maxMatchesPerUser
      );
    });
    if (edge) selectEdge(edge);
  }

  return {
    selected,
    matchCounts,
    unmatchedUserIds: Array.from(userIds).filter(
      (userId) => (matchCounts.get(userId) || 0) === 0,
    ),
  };
};

const buildCompatibilityEdges = async ({
  room,
  cycle,
  users,
  prefsByUser,
  now,
}) => {
  const userIds = users.map((user) => user._id.toString());
  const [answersByUser, existingActivePairSet] = await Promise.all([
    getAnswersByUser(userIds),
    getExistingActivePairSet({ roomId: room._id, userIds }),
  ]);
  const edges = [];

  for (let leftIndex = 0; leftIndex < users.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < users.length;
      rightIndex += 1
    ) {
      const userA = users[leftIndex];
      const userB = users[rightIndex];
      const pairKey = getPairKey(userA._id, userB._id);
      if (existingActivePairSet.has(pairKey)) continue;

      const prefsA = prefsByUser.get(userA._id.toString());
      const prefsB = prefsByUser.get(userB._id.toString());
      const eligibility = getHardEligibilityResult({
        seeker: userA,
        seekerPrefs: prefsA,
        candidate: userB,
        candidatePrefs: prefsB,
        now,
      });
      if (!eligibility.ok) continue;

      const distanceMeters = getDistanceMetersBetweenUsers(userA, userB);
      const maxDistanceKm = Math.max(
        1,
        Math.min(
          Number(prefsA?.distance || 50),
          Number(prefsB?.distance || 50),
        ),
      );
      const userBForScore = { ...userB, distance: distanceMeters };
      const userAForScore = { ...userA, distance: distanceMeters };
      const scoreAB = scoreCandidate({
        seeker: userA,
        candidate: userBForScore,
        context: {
          seekerPrefs: prefsA,
          candidatePrefs: prefsB,
          now,
          maxDistanceKm,
          seekerAnswers: answersByUser.get(userA._id.toString()) || new Map(),
          candidateAnswers:
            answersByUser.get(userB._id.toString()) || new Map(),
        },
      });
      const scoreBA = scoreCandidate({
        seeker: userB,
        candidate: userAForScore,
        context: {
          seekerPrefs: prefsB,
          candidatePrefs: prefsA,
          now,
          maxDistanceKm,
          seekerAnswers: answersByUser.get(userB._id.toString()) || new Map(),
          candidateAnswers:
            answersByUser.get(userA._id.toString()) || new Map(),
        },
      });
      const score = (scoreAB.totalScore + scoreBA.totalScore) / 2;
      if (score < ROOM_MIN_COMPATIBILITY_SCORE) continue;

      edges.push({
        userId1: userA._id.toString(),
        userId2: userB._id.toString(),
        score,
        matchingNote: buildRoomMatchingNote({
          room,
          cycle,
          score,
          seekerScore: scoreAB,
          candidateScore: scoreBA,
        }),
      });
    }
  }

  return edges;
};

const notifyRoomMatch = async ({
  room,
  matchRoom,
  userId1,
  userId2,
  balances,
}) => {
  const roomId = matchRoom._id.toString();
  const payloadForUser1 = buildRoomMatchPayload({
    room,
    matchRoom,
    matchedUserId: userId2,
    matchingNote: matchRoom.matchingNote,
  });
  const payloadForUser2 = buildRoomMatchPayload({
    room,
    matchRoom,
    matchedUserId: userId1,
    matchingNote: matchRoom.matchingNote,
  });

  socketService.emitToUser(userId1, "roomMatchFound", payloadForUser1);
  socketService.emitToUser(userId2, "roomMatchFound", payloadForUser2);
  socketService.emitToUser(userId1, "inbox_updated", {
    roomId,
    status: "active",
  });
  socketService.emitToUser(userId2, "inbox_updated", {
    roomId,
    status: "active",
  });
  socketService.emitToUser(userId1, "creditsUpdated", {
    credits: balances?.[userId1.toString()],
    reason: "room_conversation_start",
  });
  socketService.emitToUser(userId2, "creditsUpdated", {
    credits: balances?.[userId2.toString()],
    reason: "room_conversation_start",
  });

  await Promise.allSettled([
    sendNotificationToUser(userId1, {
      title: "Room match found!",
      body: `You matched through ${room.title}.`,
      tag: `room-match-${roomId}`,
      data: {
        type: "room_match",
        roomId,
        locationRoomId: room._id.toString(),
        matchedUserId: userId2.toString(),
        url: `/app/chat/${roomId}`,
      },
    }),
    sendNotificationToUser(userId2, {
      title: "Room match found!",
      body: `You matched through ${room.title}.`,
      tag: `room-match-${roomId}`,
      data: {
        type: "room_match",
        roomId,
        locationRoomId: room._id.toString(),
        matchedUserId: userId1.toString(),
        url: `/app/chat/${roomId}`,
      },
    }),
  ]);
};

const markInsufficientCreditUsers = async ({ roomId, userIds, now }) => {
  const users = await User.find({ _id: { $in: userIds } })
    .select("credits")
    .lean();
  const insufficientUserIds = users
    .filter((user) => user.credits < CREDIT_RULES.CONVERSATION_COST)
    .map((user) => user._id);
  if (!insufficientUserIds.length) return [];

  await LocationRoomPin.updateMany(
    { room: roomId, user: { $in: insufficientUserIds } },
    {
      $set: {
        poolStatus: "insufficient_credits",
        lastPoolError: "insufficient_credits",
        updatedAt: now,
      },
    },
  );
  return insufficientUserIds;
};

const createRoomMatches = async ({ room, cycle, pairs, now }) => {
  const matches = [];
  const matchedUserIds = new Set();
  const skippedUsers = [];

  for (const pair of pairs) {
    const userId1 = pair.userId1;
    const userId2 = pair.userId2;
    const creditSpend = await spendCreditsForConversationStart(
      userId1,
      userId2,
    );
    if (!creditSpend.success) {
      const insufficientUserIds = await markInsufficientCreditUsers({
        roomId: room._id,
        userIds: [userId1, userId2],
        now,
      });
      for (const userId of insufficientUserIds) {
        skippedUsers.push({ user: userId, reason: "insufficient_credits" });
      }
      continue;
    }

    const matchRoom = await getOrCreateMatchRoom(
      userId1,
      userId2,
      pair.matchingNote,
      {
        source: "location_room",
        locationRoom: room._id,
        locationRoomCycle: cycle._id,
        sourceMetadata: {
          title: room.title,
          subtitle: room.location?.formattedAddress || "",
        },
      },
    );
    matchedUserIds.add(userId1.toString());
    matchedUserIds.add(userId2.toString());
    await LocationRoomPin.updateMany(
      {
        room: room._id,
        user: { $in: [userId1, userId2] },
      },
      {
        $set: {
          lastMatchRoom: matchRoom._id,
        },
      },
    );
    matches.push({
      users: [userId1, userId2],
      matchRoom: matchRoom._id,
      score: pair.score,
    });
    await notifyRoomMatch({
      room,
      matchRoom,
      userId1,
      userId2,
      balances: creditSpend.balances,
    });
  }

  if (matchedUserIds.size) {
    await LocationRoomPin.updateMany(
      {
        room: room._id,
        user: { $in: Array.from(matchedUserIds) },
      },
      {
        $set: {
          inPool: false,
          poolStatus: "matched",
          lastMatchedAt: now,
          lastMatchedCycle: cycle._id,
          lastPoolError: "",
        },
      },
    );
  }

  return {
    matches,
    matchedUserIds,
    skippedUsers,
  };
};

export const runLocationRoomCycle = async ({ room, now = new Date() }) => {
  const cycle = await LocationRoomCycle.create({
    room: room._id,
    status: "running",
    startedAt: now,
  });
  const pins = await LocationRoomPin.find({
    room: room._id,
    isPinned: true,
    inPool: true,
    poolStatus: "in_pool",
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
      if (reason === "insufficient_credits") {
        await LocationRoomPin.updateOne(
          { room: room._id, user: userId },
          {
            $set: {
              poolStatus: "insufficient_credits",
              lastPoolError: reason,
            },
          },
        );
      }
      continue;
    }
    if (isProfileEligibleForRoom(user)) eligibleUsers.push(user);
  }

  const preferenceDocs = await UserPreference.find({
    user: { $in: eligibleUsers.map((user) => user._id) },
  }).lean();
  const preferenceDocByUser = new Map(
    preferenceDocs.map((doc) => [doc.user.toString(), doc]),
  );
  const prefsByUser = new Map(
    eligibleUsers.map((user) => [
      user._id.toString(),
      normalizePreference(preferenceDocByUser.get(user._id.toString()), {
        userGender: user.gender,
      }),
    ]),
  );
  const edges = await buildCompatibilityEdges({
    room,
    cycle,
    users: eligibleUsers,
    prefsByUser,
    now,
  });
  const { selected, unmatchedUserIds } = selectRoomMatchPairs({
    edges,
    eligibleUserIds: eligibleUsers.map((user) => user._id),
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

  cycle.status = "completed";
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

  socketService.emitToUsers(poolUserIds, "room_pool_updated", {
    roomId: room._id.toString(),
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

export const processDueLocationRoomCycle = async ({
  roomId,
  now = new Date(),
}) => {
  const staleLockBefore = new Date(now.getTime() - ROOM_CYCLE_LOCK_STALE_MS);
  const room = await LocationRoom.findOneAndUpdate(
    {
      _id: roomId,
      status: "active",
      nextMatchAt: { $lte: now },
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
    const retryAt = new Date(Date.now() + ROOM_CYCLE_RETRY_MS);
    await Promise.allSettled([
      LocationRoomCycle.create({
        room: room._id,
        status: "failed",
        startedAt: now,
        completedAt: new Date(),
        nextMatchAt: retryAt,
        error: error?.message || "unknown_error",
      }),
      LocationRoom.findByIdAndUpdate(room._id, {
        $set: {
          nextMatchAt: retryAt,
          isCycleLocked: false,
          cycleLockedAt: null,
        },
      }),
    ]);
    throw error;
  }
};

export const runDueLocationRoomCycles = async ({
  now = new Date(),
  limit = 25,
} = {}) => {
  const rooms = await LocationRoom.find({
    status: "active",
    nextMatchAt: { $lte: now },
  })
    .select("_id")
    .sort({ nextMatchAt: 1 })
    // .limit(limit)
    .lean();

  const results = [];
  for (const room of rooms) {
    try {
      results.push(
        await processDueLocationRoomCycle({ roomId: room._id, now }),
      );
    } catch (error) {
      console.error("[rooms] cycle failed:", {
        roomId: room._id.toString(),
        message: error?.message || error,
      });
      results.push({ success: false, roomId: room._id, error });
    }
  }
  return {
    scanned: rooms.length,
    processed: results.filter((result) => !result?.skipped).length,
    results,
  };
};
