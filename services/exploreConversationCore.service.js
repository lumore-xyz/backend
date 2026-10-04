import UserPreference from "../models/preference.model.js";
import CreditLedger from "../models/creditLedger.model.js";
import ExploreDaily from "../models/exploreDaily.model.js";
import { idsEqual } from "../utils/objectId.js";
import { getPairKey } from "../utils/matchIds.js";
import { EXPLORE_DAILY_STATUS } from "../utils/exploreDaily.js";
import { MATCH_ROOM_STATUS } from "../utils/matchRoom.js";
import { logError } from "../utils/logError.js";
import {
  refundConversationStart,
  spendCreditsForConversationStart,
} from "./conversationCredits.service.js";
import {
  findExistingMatchRoom,
  getOrCreateMatchRoom,
} from "./matching.service.js";
import {
  exploreNoteFacts,
  fallbackExploreNote,
  fingerprint,
} from "./exploreProfile.service.js";
import { normalizePreference } from "./matchingPolicy.service.js";
import {
  fail,
  loadDiscoverableCandidate,
  loadExploreContext,
} from "./exploreContext.service.js";
import { getUtcDateKey } from "../utils/utcDate.js";

export const startExploreConversation = async ({ userId, profileId, now = new Date() }) => {
  await Promise.all([ExploreDaily.init(), CreditLedger.init()]);
  const { user: seeker, prefs } = await loadExploreContext({ userId, now });
  const daily = await ExploreDaily.findOne({
    user: userId,
    dayKey: getUtcDateKey(now),
    status: EXPLORE_DAILY_STATUS.READY,
  }).lean();
  const selected = daily?.profiles.find((profile) => idsEqual(profile.user, profileId));
  if (!selected) throw fail("Choose a profile from today's unlocked suggestions", 403, "PROFILE_NOT_UNLOCKED");
  const candidate = await loadDiscoverableCandidate({
    userId,
    prefs,
    profileId,
    now,
    includeMatched: false,
  });
  if (!candidate) throw fail("This profile is no longer available", 409, "PROFILE_UNAVAILABLE");
  const existing = await findExistingMatchRoom(userId, profileId);
  if (existing) {
    if (existing.status !== MATCH_ROOM_STATUS.ACTIVE) throw fail("This conversation has ended", 409, "CHAT_ARCHIVED");
    return { roomId: String(existing._id), created: false };
  }
  const candidatePrefs = normalizePreference(
    await UserPreference.findOne({ user: profileId }).lean(),
    { userGender: candidate.gender },
  );
  const facts = exploreNoteFacts({ seeker, seekerPrefs: prefs, candidate, candidatePrefs });
  const note = selected.noteFingerprint === fingerprint(facts)
    ? selected.matchNote
    : fallbackExploreNote(facts);
  const creditSpend = await spendCreditsForConversationStart(userId, profileId);
  if (!creditSpend.success) {
    if (creditSpend.reason === "INSUFFICIENT_CREDITS") {
      throw fail("One credit is required to start a conversation", 409, creditSpend.reason);
    }
    throw fail("User not found", 404, creditSpend.reason);
  }

  try {
    const roomResult = await getOrCreateMatchRoom(userId, profileId, {
      version: "daily_explore",
      totalScore: selected.score,
      distanceKm: selected.distanceKm ?? null,
      oneSentenceNote: note,
      notesByUser: {
        [userId]: note,
        [profileId]: "A connection from today's Explore suggestions.",
      },
    }, { pairKey: getPairKey(userId, profileId), returnCreationStatus: true });
    const room = roomResult.room;
    if (room.status !== MATCH_ROOM_STATUS.ACTIVE) throw fail("This conversation has ended", 409, "CHAT_ARCHIVED");
    if (!roomResult.created && !creditSpend.alreadyCharged) {
      await refundConversationStart({
        initiatorId: userId,
        ledgerId: creditSpend.ledgerId,
      }).catch((refundError) => {
        logError("[explore] duplicate conversation charge refund failed", refundError);
      });
    }
    return { roomId: String(room._id), created: roomResult.created };
  } catch (error) {
    if (!creditSpend.alreadyCharged) {
      await refundConversationStart({
        initiatorId: userId,
        ledgerId: creditSpend.ledgerId,
      }).catch((refundError) => {
        logError("[explore] conversation_credit_refund_failed", refundError);
      });
    }
    throw error;
  }
};
