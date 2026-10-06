import { createHash } from "node:crypto";
import User from "../models/user.model.js";
import { getAge } from "../utils/age.js";
import { calculateDistanceMeters, getGeoPointFromLocation } from "../utils/location.js";
import { normalizeUniqueStringList } from "../utils/strings.js";
import { EXPLORE_NOTE_STATUS } from "../utils/exploreDaily.js";
import { isProfileFieldVisible } from "../utils/profileVisibility.js";
import { generateMatchNote } from "./matchNote.service.js";
import { getMatchNoteProfileContext } from "./matchNoteContent.service.js";
import { getAnswersByUser, getReadableAnswersByUser } from "./matchingAnswers.service.js";
import {
  getHardEligibilityResult,
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
  distanceKm: visible(seeker, "location") && visible(candidate, "location") ? distanceBetween(seeker, candidate) : null,
  common: {
    goals: visible(seeker, "goal") && visible(candidate, "goal") ? intersection(goals(seekerPrefs), goals(candidatePrefs)) : [],
    interests: visible(seeker, "interests") && visible(candidate, "interests") ? intersection(seeker.interests, candidate.interests) : [],
    languages: visible(seeker, "languages") && visible(candidate, "languages") ? intersection(seeker.languages, candidate.languages) : [],
  },
  // Cached notes can mention any public profile detail, not only shared traits.
  profiles: {
    viewer: getMatchNoteProfileContext(seeker, seekerPrefs),
    suggestedPerson: getMatchNoteProfileContext(candidate, candidatePrefs),
  },
});
export const fingerprint = (facts) => createHash("sha256").update(JSON.stringify(facts)).digest("hex");
export const fallbackExploreNote = (facts) => {
  const sharedReasons = [];
  const nearby = Number.isFinite(facts.distanceKm) && facts.distanceKm <= 25;
  const name = facts.name || "this person";
  if (facts.common.goals.length) {
    sharedReasons.push(`you both want ${facts.common.goals[0].replace(/[-_]/g, " ")}`);
  }
  if (facts.common.interests.length) {
    sharedReasons.push(`you both enjoy ${facts.common.interests.slice(0, 2).join(" and ")}`);
  }
  if (facts.common.languages.length) {
    sharedReasons.push(`you can connect in ${facts.common.languages[0]}`);
  }

  const connection = sharedReasons.length > 1
    ? `${sharedReasons.slice(0, -1).join(", ")}, and ${sharedReasons.at(-1)}`
    : sharedReasons[0];
  const nudge = "That gives you an easy place to start; take a look and see what you think.";
  if (connection && nearby) return `Meet ${name}. ${connection}, and you live nearby too. ${nudge}`;
  if (connection) return `Meet ${name}. ${connection}. ${nudge}`;
  if (nearby) return `Meet ${name}. You're nearby, so saying hello could be an easy place to start. See what you think.`;
  return `Meet ${name}. Take a look and see whether there's an easy conversation starter between you.`;
};

export const generateProfiles = async ({ seeker, prefs, now, additionalExcludedIds = [] }) => {
  const excludedIds = [
    ...new Set([
      ...(await getExcludedIds(seeker._id)),
      ...additionalExcludedIds.map((id) => String(id)),
    ]),
  ];
  const candidates = await User.aggregate([
    { $match: buildExploreCandidateQuery({ userId: seeker._id, prefs, excludedIds, now }) },
    { $sort: { lastActive: -1, _id: -1 } },
    { $limit: CANDIDATE_LIMIT },
    { $project: Object.fromEntries(SELECT.split(" ").map((field) => [field, 1])) },
  ]);
  let candidateCount = 0;
  let selected = [];
  const candidateIds = candidates.map((candidate) => candidate._id);
  const [prefDocs, answers] = await Promise.all([
    getPreferencesByUserIds(candidateIds),
    getAnswersByUser([seeker._id, ...candidateIds]),
  ]);
  const seekerAnswers = answers.get(String(seeker._id)) || new Map();

  for (const candidate of candidates) {
    const candidatePrefs = normalizePreference(prefDocs.get(String(candidate._id)), {
      userGender: candidate.gender,
    });
    if (!getHardEligibilityResult({ seeker, seekerPrefs: prefs, candidate, candidatePrefs, now }).ok) continue;

    candidateCount += 1;
    const candidateAnswers = answers.get(String(candidate._id)) || new Map();
    selected.push({
      candidate,
      candidatePrefs,
      candidateAnswers,
      ...scoreExploreCandidate({
        seeker,
        candidate,
        distanceKm: distanceBetween(seeker, candidate),
        context: { seekerPrefs: prefs, candidatePrefs, seekerAnswers, candidateAnswers },
      }),
    });
  }
  selected.sort((a, b) => b.score - a.score || String(a.candidate._id).localeCompare(String(b.candidate._id)));
  selected = selected.slice(0, RESULT_LIMIT);

  const noteUserIds = [seeker._id, ...selected.map((item) => item.candidate._id)];
  const answersByUser = new Map([[String(seeker._id), seekerAnswers]]);
  for (const item of selected) {
    answersByUser.set(String(item.candidate._id), item.candidateAnswers);
  }
  const readableAnswers = await getReadableAnswersByUser({
    userIds: noteUserIds,
    answersByUser,
  });
  const profiles = [];
  // Only the selected profiles incur provider calls, bounded to five at a time.
  for (let offset = 0; offset < selected.length; offset += 5) {
    profiles.push(...await Promise.all(selected.slice(offset, offset + 5).map(async (item) => {
      const facts = exploreNoteFacts({ seeker, seekerPrefs: prefs, ...item });
      let matchNote = fallbackExploreNote(facts);
      let noteStatus = EXPLORE_NOTE_STATUS.FALLBACK;
      try {
        const result = await generateMatchNote({
          viewer: { ...seeker, nickname: "you" },
          otherUser: { ...item.candidate, nickname: facts.name, username: null },
          viewerPreferences: prefs, suggestedPersonPreferences: item.candidatePrefs,
          viewerAnswers: readableAnswers.get(String(seeker._id)) || [],
          suggestedPersonAnswers: readableAnswers.get(String(item.candidate._id)) || [],
          timeoutMs: 5000,
          matchingNote: {
            common: facts.common,
            thisOrThat: item.thisOrThat,
            components: item.components,
            distanceKm: facts.distanceKm,
            totalScore: item.score,
          },
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
  return { profiles, candidateCount };
};

export const projectExploreProfile = (user, now) => {
  const profile = { _id: String(user._id) };
  for (const field of PROFILE_FIELDS) if (visible(user, field) && user[field] !== undefined) profile[field] = user[field];
  if (visible(user, "dob")) profile.age = getAge(user.dob, now);
  return profile;
};
