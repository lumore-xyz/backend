import {
  calculateDistanceMeters,
  getGeoPointFromLocation,
} from "../utils/location.js";
import { getAnswersByUser, getThisOrThatStats } from "./matchingAnswers.service.js";
import { CREDIT_RULES } from "./creditRules.js";
import { getPairKey } from "../utils/matchIds.js";
import { getMatchedPairSet } from "./matching.service.js";
import {
  getCommonalityBreakdown,
  getExactMatchValue,
  getHardEligibilityResult,
  getIntersection,
} from "./matchingPolicy.service.js";
import { scoreCandidate } from "./matchingScore.service.js";
import { MATCH_ROOM_SOURCE } from "../utils/matchRoom.js";

const ROOM_MIN_COMPATIBILITY_SCORE = 35;

const getDistanceMetersBetweenUsers = (userA, userB) => {
  const pointA = getGeoPointFromLocation(userA?.location);
  const pointB = getGeoPointFromLocation(userB?.location);
  return calculateDistanceMeters(pointA, pointB) || 0;
};

const round2 = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
};

export const buildRoomMatchingNote = ({
  room,
  cycle,
  score,
  seekerScore,
  candidateScore,
  seekerUser,
  candidateUser,
  seekerPrefs,
  candidatePrefs,
  seekerAnswers,
  candidateAnswers,
  distanceKm,
}) => {
  const common = getCommonalityBreakdown({
    seeker: seekerUser,
    candidate: candidateUser,
    seekerPrefs,
    candidatePrefs,
  });
  const thisOrThat = getThisOrThatStats({
    seekerAnswers: seekerAnswers || new Map(),
    candidateAnswers: candidateAnswers || new Map(),
  });

  const reasons = ["room_pool_compatibility"];
  if (common.goals.length) reasons.push("shared_goals");
  if (common.interests.length) reasons.push("shared_interests");
  if (common.languages.length) reasons.push("shared_languages");
  if (common.religion) reasons.push("shared_religion");
  if (common.diet) reasons.push("shared_diet");
  if (thisOrThat.matchedAnswers > 0) reasons.push("this_or_that_similarity");

  return {
    version: "location_room",
    source: MATCH_ROOM_SOURCE.LOCATION_ROOM,
    locationRoomId: room._id.toString(),
    locationRoomTitle: room.title,
    locationRoomCycleId: cycle._id.toString(),
    totalScore: round2(score),
    components: {
      seekerScore: round2(seekerScore?.totalScore),
      candidateScore: round2(candidateScore?.totalScore),
      profileScore: round2(seekerScore?.componentScores?.profileScore),
      intentScore: round2(seekerScore?.componentScores?.intentScore),
      thisOrThatScore: round2(seekerScore?.componentScores?.thisOrThatScore),
      distanceScore: round2(seekerScore?.componentScores?.distanceScore),
    },
    distanceKm: Number.isFinite(distanceKm) ? round2(distanceKm) : null,
    common,
    thisOrThat,
    reasons,
  };
};

export const buildCompatibilityEdges = async ({
  room,
  cycle,
  users,
  prefsByUser,
  now,
}) => {
  const userIds = users.map((user) => user._id.toString());
  const [answersByUser, existingMatchedPairSet] = await Promise.all([
    getAnswersByUser(userIds),
    getMatchedPairSet({ userIds }),
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
      if (existingMatchedPairSet.has(pairKey)) continue;

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

      const userAIsStarter = userA.credits >= CREDIT_RULES.CONVERSATION_COST;
      const userBIsStarter = userB.credits >= CREDIT_RULES.CONVERSATION_COST;
      if (!userAIsStarter && !userBIsStarter) continue;
      const starter = userAIsStarter ? userA : userB;
      const recipient = userAIsStarter ? userB : userA;
      const starterPrefs = userAIsStarter ? prefsA : prefsB;
      const recipientPrefs = userAIsStarter ? prefsB : prefsA;
      const starterScore = userAIsStarter ? scoreAB : scoreBA;
      const recipientScore = userAIsStarter ? scoreBA : scoreAB;

      edges.push({
        userId1: starter._id.toString(),
        userId2: recipient._id.toString(),
        score,
        matchingNote: buildRoomMatchingNote({
          room,
          cycle,
          score,
          seekerScore: starterScore,
          candidateScore: recipientScore,
          seekerUser: starter,
          candidateUser: recipient,
          seekerPrefs: starterPrefs,
          candidatePrefs: recipientPrefs,
          seekerAnswers: answersByUser.get(starter._id.toString()),
          candidateAnswers: answersByUser.get(recipient._id.toString()),
          distanceKm: Number.isFinite(distanceMeters)
            ? distanceMeters / 1000
            : null,
        }),
      });
    }
  }

  return {
    edges,
    blockedPairKeys: existingMatchedPairSet,
  };
};

