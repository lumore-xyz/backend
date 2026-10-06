import { randomUUID } from "node:crypto";
import CreditLedger from "../models/creditLedger.model.js";
import ExploreDaily from "../models/exploreDaily.model.js";
import User from "../models/user.model.js";
import { getNextUtcDayStart, getUtcDateKey } from "../utils/utcDate.js";
import { CREDIT_RULES } from "./creditRules.js";
import {
  debitExploreRefresh,
  debitExploreUnlock,
  settleExplorePayment,
  settleExploreRefreshPayment,
} from "./exploreCredits.service.js";
import { getHardEligibilityResult, normalizePreference } from "./matchingPolicy.service.js";
import { CREDIT_LEDGER_TYPE } from "../utils/creditLedger.js";
import {
  EXPLORE_DAILY_STATUS,
  EXPLORE_NOTE_STATUS,
} from "../utils/exploreDaily.js";
import {
  exploreNoteFacts,
  fallbackExploreNote,
  fingerprint,
  generateProfiles,
  projectExploreProfile,
} from "./exploreProfile.service.js";
import {
  buildExploreCandidateQuery,
  getExcludedIds,
  SELECT,
} from "./exploreCandidate.service.js";
import { getPreferencesByUserIds } from "./profilePreference.service.js";
import {
  fail,
  loadExploreContext,
} from "./exploreContext.service.js";

const LEASE_MS = 3 * 60 * 1000;
const initializeExploreModels = () =>
  Promise.all([ExploreDaily.init(), CreditLedger.init()]);

const responseFor = async ({ userId, now, seeker, prefs, daily }) => {
  const response = {
    dailyId: daily ? String(daily._id) : null, dayKey: getUtcDateKey(now), resetAt: getNextUtcDayStart(now),
    cost: CREDIT_RULES.EXPLORE_DAILY_COST, refreshCost: CREDIT_RULES.EXPLORE_FORCE_REFRESH_COST,
    amountPaid: daily?.amountPaid || 0,
    unlocked: daily?.status === EXPLORE_DAILY_STATUS.READY, status: "locked", candidateCount: daily?.candidateCount || 0, profiles: [],
  };
  if (
    daily?.status === EXPLORE_DAILY_STATUS.GENERATING &&
    new Date(daily.leaseUntil) > now
  ) {
    response.status = EXPLORE_DAILY_STATUS.GENERATING;
  }
  if (daily?.status === EXPLORE_DAILY_STATUS.EMPTY) {
    response.status = EXPLORE_DAILY_STATUS.EMPTY;
  }
  if (daily?.status !== EXPLORE_DAILY_STATUS.READY) return response;
  response.status = EXPLORE_DAILY_STATUS.READY;
  const excludedIds = await getExcludedIds(userId);
  const query = buildExploreCandidateQuery({ userId, prefs, excludedIds, now });
  query._id.$in = daily.profiles.map((profile) => profile.user);
  const users = await User.find(query).select(SELECT).lean();
  const prefDocs = await getPreferencesByUserIds(users.map((user) => user._id));
  const byId = new Map(users.map((user) => [String(user._id), user]));
  response.profiles = daily.profiles.flatMap((stored) => {
    const candidate = byId.get(String(stored.user));
    if (!candidate) return [];
    const candidatePrefs = normalizePreference(prefDocs.get(String(candidate._id)), { userGender: candidate.gender });
    if (!getHardEligibilityResult({ seeker, seekerPrefs: prefs, candidate, candidatePrefs, now }).ok) return [];
    const facts = exploreNoteFacts({ seeker, seekerPrefs: prefs, candidate, candidatePrefs });
    const unchanged = stored.noteFingerprint === fingerprint(facts);
    return [{ ...projectExploreProfile(candidate, now), score: stored.score, distanceKm: facts.distanceKm,
      matchNote: unchanged ? stored.matchNote : fallbackExploreNote(facts),
      noteStatus: unchanged ? stored.noteStatus : EXPLORE_NOTE_STATUS.FALLBACK }];
  });
  return response;
};

export const getDailyExplore = async ({ userId, now = new Date() }) => {
  await initializeExploreModels();
  const { user: seeker, prefs } = await loadExploreContext({ userId, now });
  const daily = await ExploreDaily.findOne({ user: userId, dayKey: getUtcDateKey(now) }).lean();
  return responseFor({ userId, now, seeker, prefs, daily });
};

export const unlockDailyExplore = async ({ userId, now = new Date() }) => {
  const startedAt = Date.now();
  await initializeExploreModels();
  const currentTime = () => new Date(now.getTime() + Date.now() - startedAt);
  const { user: seeker, prefs } = await loadExploreContext({ userId, now });
  const dayKey = getUtcDateKey(now);
  const query = { user: userId, dayKey };
  let daily = await ExploreDaily.findOne(query).lean();
  if (
    [EXPLORE_DAILY_STATUS.READY, EXPLORE_DAILY_STATUS.EMPTY].includes(
      daily?.status,
    )
  ) {
    return responseFor({ userId, now, seeker, prefs, daily });
  }
  if (
    daily?.status === EXPLORE_DAILY_STATUS.GENERATING &&
    new Date(daily.leaseUntil) > now
  ) {
    return responseFor({ userId, now, seeker, prefs, daily });
  }
  if (daily?.status !== EXPLORE_DAILY_STATUS.PREPARED) {
    if (seeker.credits < CREDIT_RULES.EXPLORE_DAILY_COST) throw fail("Insufficient credits", 409, "INSUFFICIENT_CREDITS");
    const generationToken = randomUUID();
    const lease = {
      status: EXPLORE_DAILY_STATUS.GENERATING,
      generationToken,
      leaseUntil: new Date(now.getTime() + LEASE_MS),
    };
    if (!daily) {
      try {
        daily = (await ExploreDaily.create({ ...query, resetAt: getNextUtcDayStart(now), ...lease })).toObject();
      } catch (error) {
        if (error.code !== 11000) throw error;
        return getDailyExplore({ userId, now });
      }
    } else {
      daily = await ExploreDaily.findOneAndUpdate({ ...query, $or: [
        { status: EXPLORE_DAILY_STATUS.FAILED },
        {
          status: EXPLORE_DAILY_STATUS.GENERATING,
          leaseUntil: { $lte: now },
        },
      ] }, { $set: lease }, { returnDocument: "after" }).lean();
      if (!daily) return getDailyExplore({ userId, now });
    }
    try {
      const generated = await generateProfiles({ seeker, prefs, now });
      daily = await ExploreDaily.findOneAndUpdate(
        {
          ...query,
          status: EXPLORE_DAILY_STATUS.GENERATING,
          generationToken,
        },
        {
          $set: {
            ...generated,
            status: generated.profiles.length
              ? EXPLORE_DAILY_STATUS.PREPARED
              : EXPLORE_DAILY_STATUS.EMPTY,
          },
        },
        { returnDocument: "after" },
      ).lean();
      if (!daily) return getDailyExplore({ userId, now });
    } catch (error) {
      await ExploreDaily.updateOne(
        {
          ...query,
          status: EXPLORE_DAILY_STATUS.GENERATING,
          generationToken,
        },
        { $set: { status: EXPLORE_DAILY_STATUS.FAILED } },
      );
      throw error;
    }
  }
  if (daily.status === EXPLORE_DAILY_STATUS.EMPTY) {
    return responseFor({ userId, now, seeker, prefs, daily });
  }
  if (getUtcDateKey(currentTime()) !== dayKey) throw fail("The Explore day has reset; unlock today's list", 409, "EXPLORE_DAY_EXPIRED");
  const available = await responseFor({
    userId,
    now,
    seeker,
    prefs,
    daily: { ...daily, status: EXPLORE_DAILY_STATUS.READY },
  });
  if (!available.profiles.length) {
    throw fail("Today's selected profiles are no longer available; no new charge was made", 409, "NO_PROFILES_AVAILABLE");
  }
  await debitExploreUnlock({ userId, dayKey, referenceId: `explore:${userId}:${dayKey}` });
  await settleExplorePayment(userId);
  return getDailyExplore({ userId, now: currentTime() });
};

export const forceRefreshDailyExplore = async ({
  userId,
  requestId,
  now = new Date(),
}) => {
  await initializeExploreModels();
  const { user: seeker, prefs } = await loadExploreContext({ userId, now });
  await settleExploreRefreshPayment(userId);
  const dayKey = getUtcDateKey(now);
  const daily = await ExploreDaily.findOne({
    user: userId,
    dayKey,
    status: EXPLORE_DAILY_STATUS.READY,
  }).lean();
  if (!daily) {
    throw fail("Unlock today's Explore list before refreshing it", 409, "EXPLORE_NOT_READY");
  }

  const referenceId = `explore-refresh:${userId}:${dayKey}:${requestId}`;
  if (daily.lastRefreshReferenceId === referenceId) return getDailyExplore({ userId, now });
  if (daily.pendingRefresh && daily.pendingRefresh.referenceId !== referenceId) {
    throw fail("A refresh is already pending; retry it with the original requestId", 409, "EXPLORE_REFRESH_PENDING");
  }
  if (daily.pendingRefresh?.referenceId === referenceId) {
    await debitExploreRefresh({ userId, dayKey, referenceId });
    await settleExploreRefreshPayment(userId);
    return getDailyExplore({ userId, now });
  }
  const priorRefresh = await CreditLedger.findOne({
    user: userId,
    type: CREDIT_LEDGER_TYPE.EXPLORE_REFRESH,
    referenceType: CREDIT_LEDGER_TYPE.EXPLORE_REFRESH,
    referenceId,
  }).lean();
  if (priorRefresh) {
    throw fail("Explore refresh was charged but its replacement list is unavailable; contact support", 503, "EXPLORE_REFRESH_RECOVERY_FAILED");
  }
  if (seeker.credits < CREDIT_RULES.EXPLORE_FORCE_REFRESH_COST) {
    throw fail("Insufficient credits", 409, "INSUFFICIENT_CREDITS");
  }

  const currentProfileIds = daily.profiles.map((profile) => profile.user);
  const generated = await generateProfiles({
    seeker,
    prefs,
    now,
    additionalExcludedIds: currentProfileIds,
  });
  if (!generated.profiles.length) {
    throw fail("No different profiles are available right now", 409, "NO_NEW_PROFILES");
  }

  const pendingRefresh = { referenceId, ...generated };
  const staged = await ExploreDaily.findOneAndUpdate(
    {
      user: userId,
      dayKey,
      status: EXPLORE_DAILY_STATUS.READY,
      pendingRefresh: null,
    },
    { $set: { pendingRefresh } },
    { returnDocument: "after" },
  ).lean();
  if (!staged) {
    const latest = await ExploreDaily.findOne({
      user: userId,
      dayKey,
      status: EXPLORE_DAILY_STATUS.READY,
    }).lean();
    if (latest?.lastRefreshReferenceId === referenceId) return getDailyExplore({ userId, now });
    if (latest?.pendingRefresh?.referenceId !== referenceId) {
      throw fail("A refresh is already pending; retry it with the original requestId", 409, "EXPLORE_REFRESH_PENDING");
    }
  }
  await debitExploreRefresh({ userId, dayKey, referenceId });
  await settleExploreRefreshPayment(userId);
  return getDailyExplore({ userId, now });
};
