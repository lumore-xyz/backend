import LocationRoomPin from "../models/locationRoomPin.model.js";
import User from "../models/user.model.js";
import { CREDIT_RULES } from "./creditRules.js";
import {
  refundConversationStart,
  spendCreditsForConversationStart,
} from "./conversationCredits.service.js";
import { getOrCreateMatchRoom, hasExistingMatchRoom } from "./matching.service.js";
import { buildMatchNote } from "./matchNote.service.js";
import { notifyRoomMatch } from "./locationRoomNotification.service.js";
import { logError } from "../utils/logError.js";
import { getPairKey } from "../utils/matchIds.js";
import { LOCATION_ROOM_POOL_STATUS } from "../utils/locationRoomPool.js";
import { MATCH_ROOM_SOURCE } from "../utils/matchRoom.js";

const LOG_PREFIX = "[location-room-match]";

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
        poolStatus: LOCATION_ROOM_POOL_STATUS.INSUFFICIENT_CREDITS,
        lastPoolError: LOCATION_ROOM_POOL_STATUS.INSUFFICIENT_CREDITS,
        updatedAt: now,
      },
    },
  );
  return insufficientUserIds;
};

const createMatch = async ({
  room,
  cycle,
  pair,
  now,
  matchedUserIds,
  matches,
  skippedUsers,
}) => {
  const userId1 = pair.userId1;
  const userId2 = pair.userId2;
  if (await hasExistingMatchRoom(userId1, userId2)) {
    skippedUsers.push({ user: userId1, reason: "already_matched" });
    skippedUsers.push({ user: userId2, reason: "already_matched" });
    return;
  }

  const creditSpend = await spendCreditsForConversationStart(userId1, userId2);
  if (!creditSpend.success) {
    const insufficientUserIds = await markInsufficientCreditUsers({
      roomId: room._id,
      userIds: [userId1],
      now,
    });
    for (const userId of insufficientUserIds) {
      skippedUsers.push({
        user: userId,
        reason: LOCATION_ROOM_POOL_STATUS.INSUFFICIENT_CREDITS,
      });
    }
    return;
  }

  let enrichedMatchingNote = pair.matchingNote;
  try {
    enrichedMatchingNote = await buildMatchNote({
      seekerId: userId1,
      candidateId: userId2,
      matchingNote: pair.matchingNote,
      loadUsers: async ({ seekerId, candidateId }) =>
        User.find({ _id: { $in: [seekerId, candidateId] } })
          .select("_id username nickname")
          .lean(),
    }) || pair.matchingNote;
  } catch (error) {
    logError(`${LOG_PREFIX} match_note_generation_failed`, error);
  }

  const persistedNote = { ...(enrichedMatchingNote || pair.matchingNote) };
  delete persistedNote.oneSentenceNote;
  delete persistedNote.notesByUser;
  delete persistedNote.aiSummary;
  let matchRoom;
  try {
    const roomResult = await getOrCreateMatchRoom(userId1, userId2, persistedNote, {
      source: MATCH_ROOM_SOURCE.LOCATION_ROOM,
      locationRoom: room._id,
      locationRoomCycle: cycle._id,
      pairKey: getPairKey(userId1, userId2),
      returnCreationStatus: true,
      sourceMetadata: {
        title: room.title,
        subtitle: room.location?.formattedAddress || "",
      },
    });
    matchRoom = roomResult.room;
    if (!roomResult.created) {
      if (!creditSpend.alreadyCharged) {
        await refundConversationStart({
          initiatorId: userId1,
          ledgerId: creditSpend.ledgerId,
        }).catch((refundError) => {
          logError(`${LOG_PREFIX} duplicate charge refund failed`, refundError);
        });
      }
      skippedUsers.push(
        { user: userId1, reason: "already_matched" },
        { user: userId2, reason: "already_matched" },
      );
      return;
    }
  } catch (error) {
    if (!creditSpend.alreadyCharged) {
      await refundConversationStart({
        initiatorId: userId1,
        ledgerId: creditSpend.ledgerId,
      }).catch((refundError) => {
        logError(`${LOG_PREFIX} conversation_credit_refund_failed`, refundError);
      });
    }
    throw error;
  }
  if (enrichedMatchingNote?.oneSentenceNote) {
    matchRoom.matchingNote = enrichedMatchingNote;
  }
  matchedUserIds.add(userId1.toString());
  matchedUserIds.add(userId2.toString());
  await LocationRoomPin.updateMany(
    { room: room._id, user: { $in: [userId1, userId2] } },
    { $set: { lastMatchRoom: matchRoom._id } },
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
};

export const createRoomMatches = async ({ room, cycle, pairs, now }) => {
  const matches = [];
  const matchedUserIds = new Set();
  const skippedUsers = [];

  for (const pair of pairs) {
    await createMatch({
      room,
      cycle,
      pair,
      now,
      matchedUserIds,
      matches,
      skippedUsers,
    });
  }

  if (matchedUserIds.size) {
    await LocationRoomPin.updateMany(
      { room: room._id, user: { $in: Array.from(matchedUserIds) } },
      {
        $set: {
          inPool: false,
          poolStatus: LOCATION_ROOM_POOL_STATUS.MATCHED,
          lastMatchedAt: now,
          lastMatchedCycle: cycle._id,
          lastPoolError: "",
        },
      },
    );
  }

  return { matches, matchedUserIds, skippedUsers };
};
