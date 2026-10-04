import { createHash } from "node:crypto";
import User from "../models/user.model.js";
import { getAge } from "../utils/age.js";
import { calculateDistanceMeters, getGeoPointFromLocation } from "../utils/location.js";
import { normalizeUniqueStringList } from "../utils/strings.js";
import { EXPLORE_NOTE_STATUS } from "../utils/exploreDaily.js";
import { isProfileFieldVisible } from "../utils/profileVisibility.js";
import { generateMatchNote } from "./matchNote.service.js";
import { getAnswersByUser } from "./matchingAnswers.service.js";
import {
  getIntersection,
  normalizePreference,
} from "./matchingPolicy.service.js";
import { scoreExploreCandidate } from "./exploreMatchingPolicy.service.js";
import { getPreferencesByUserIds } from "./profilePreference.service.js";
import { logError } from "../utils/logError.js";
import {
  buildExploreCandidateQuery,
  getExcludedIds,
  SELECT,
} from "./exploreCandidate.service.js";

const CANDIDATE_LIMIT = 100;
const RESULT_LIMIT = 10;
const PROFILE_FIELDS = ["nickname", "profilePicture", "gender", "bio", "interests", "languages", "isVerified"];
const visible = (user, field) => isProfileFieldVisible(user, field);

const goals = (prefs) => normalizeUniqueStringList([
  prefs.goal?.primary,
  prefs.goal?.secondary,
  prefs.goal?.tertiary,
]);
const intersection = (a, b) => {
  return getIntersection(
    normalizeUniqueStringList(a),
    normalizeUniqueStringList(b),
  );
};

export const distanceBetween = (seeker, candidate) => {
  const point = (user) => {
    const value = getGeoPointFromLocation(user.location);
    if (!value || Math.abs(value.longitude) > 180 || Math.abs(value.latitude) > 90 ||
      (value.longitude === 0 && value.latitude === 0)) return null;
    return value;
  };
  const meters = calculateDistanceMeters(point(seeker), point(candidate));
  return meters === null ? null : Math.round(meters / 100) / 10;
};

export const exploreNoteFacts = ({ seeker, seekerPrefs, candidate, candidatePrefs }) => ({
  name: visible(candidate, "nickname") ? candidate.nickname || "this person" : "this person",
  distanceKm: visible(candidate, "location") ? distanceBetween(seeker, candidate) : null,
  common: {
    goals: visible(candidate, "goal") ? intersection(goals(seekerPrefs), goals(candidatePrefs)) : [],
    interests: visible(candidate, "interests") ? intersection(seeker.interests, candidate.interests) : [],
    languages: visible(candidate, "languages") ? intersection(seeker.languages, candidate.languages) : [],
  },
});
export const fingerprint = (facts) => createHash("sha256").update(JSON.stringify(facts)).digest("hex");
export const fallbackExploreNote = (facts) => {
  const reasons = [];
  if (Number.isFinite(facts.distanceKm) && facts.distanceKm <= 25) reasons.push("you live nearby");
  if (facts.common.goals.length) reasons.push(`you both want ${facts.common.goals[0].replace(/[-_]/g, " ")}`);
  if (facts.common.interests.length) reasons.push(`you share an interest in ${facts.common.interests[0]}`);
  return reasons.length ? `Worth exploring: ${reasons.join(" and ")}.` : "A profile selected from your age and gender preferences; explore whether you connect.";
};

export const generateProfiles = async ({ seeker, prefs, now, additionalExcludedIds = [] }) => {
  const excludedIds = [
    ...new Set([
      ...(await getExcludedIds(seeker._id)),
      ...additionalExcludedIds.map((id) => String(id)),
    ]),
  ];
  // ponytail: sample a bounded pool; use indexed stratification if discovery quality needs it.
  const candidates = await User.aggregate([
    { $match: buildExploreCandidateQuery({ userId: seeker._id, prefs, excludedIds, now }) },
    { $sample: { size: CANDIDATE_LIMIT } },
    { $project: Object.fromEntries(SELECT.split(" ").map((field) => [field, 1])) },
  ]);
  const ids = [seeker._id, ...candidates.map((user) => user._id)];
  const [prefDocs, answers] = await Promise.all([
    getPreferencesByUserIds(candidates.map((user) => user._id)),
    getAnswersByUser(ids),
  ]);
  const ranked = candidates.map((candidate) => {
    const candidatePrefs = normalizePreference(prefDocs.get(String(candidate._id)), { userGender: candidate.gender });
    return {
      candidate, candidatePrefs,
      ...scoreExploreCandidate({
        seeker, candidate, distanceKm: distanceBetween(seeker, candidate),
        context: {
          seekerPrefs: prefs, candidatePrefs,
          seekerAnswers: answers.get(String(seeker._id)) || new Map(),
          candidateAnswers: answers.get(String(candidate._id)) || new Map(),
        },
      }),
    };
  }).sort((a, b) => b.score - a.score || String(a.candidate._id).localeCompare(String(b.candidate._id)));

  const selected = ranked.slice(0, RESULT_LIMIT);
  const profiles = [];
  // Only the selected profiles incur provider calls, bounded to five at a time.
  for (let offset = 0; offset < selected.length; offset += 5) {
    profiles.push(...await Promise.all(selected.slice(offset, offset + 5).map(async (item) => {
      const facts = exploreNoteFacts({ seeker, seekerPrefs: prefs, ...item });
      let matchNote = fallbackExploreNote(facts);
      let noteStatus = EXPLORE_NOTE_STATUS.FALLBACK;
      try {
        const result = await generateMatchNote({
          viewer: { nickname: "you" }, otherUser: { nickname: facts.name }, timeoutMs: 5000,
          matchingNote: { common: facts.common, distanceKm: facts.distanceKm, totalScore: item.score },
        });
        if (!result.meta.usedFallback && result.sentence) {
          matchNote = result.sentence;
          noteStatus = EXPLORE_NOTE_STATUS.GENERATED;
        }
      } catch (error) {
        logError("[explore] match_note_failed", error);
      }
      return { user: item.candidate._id, score: item.score, distanceKm: facts.distanceKm, components: item.components,
        matchNote, noteStatus, noteFingerprint: fingerprint(facts) };
    })));
  }
  return { profiles, candidateCount: candidates.length };
};

export const projectExploreProfile = (user, now) => {
  const profile = { _id: String(user._id) };
  for (const field of PROFILE_FIELDS) if (visible(user, field) && user[field] !== undefined) profile[field] = user[field];
  if (visible(user, "dob")) profile.age = getAge(user.dob, now);
  return profile;
};
