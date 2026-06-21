import assert from "node:assert/strict";
import test from "node:test";

import { Types } from "mongoose";

import { __testHelpers } from "../services/locationRoomMatching.service.js";

const { buildRoomMatchingNote, getCommonalityBreakdown, getThisOrThatStats } =
  __testHelpers;

const buildRoom = () => ({
  _id: new Types.ObjectId("64a0000000000000000000a1"),
  title: "Indiranagar Evenings",
});

const buildCycle = () => ({
  _id: new Types.ObjectId("64a0000000000000000000a2"),
});

const buildSeekerScore = () => ({
  totalScore: 72.4567,
  componentScores: {
    profileScore: 38.1234,
    intentScore: 18.5,
    thisOrThatScore: 9.8,
    distanceScore: 5.6,
  },
});

const buildCandidateScore = () => ({
  totalScore: 71.2233,
  componentScores: {
    profileScore: 37.9,
    intentScore: 17.4,
    thisOrThatScore: 9.5,
    distanceScore: 5.4,
  },
});

test("buildRoomMatchingNote emits source=location_room with rich metadata", () => {
  const seeker = {
    _id: new Types.ObjectId(),
    interests: ["music", "travel", "food"],
    languages: ["english", "hindi"],
    religion: "Hindu",
    diet: "vegetarian",
    lifestyle: { drinking: "never", smoking: "never", pets: "love-pets" },
  };
  const candidate = {
    _id: new Types.ObjectId(),
    interests: ["music", "cooking"],
    languages: ["english"],
    religion: "Hindu",
    diet: "vegetarian",
    lifestyle: { drinking: "never", smoking: "never", pets: "love-pets" },
  };
  const seekerAnswers = new Map([
    ["q1", "left"],
    ["q2", "right"],
    ["q3", "left"],
  ]);
  const candidateAnswers = new Map([
    ["q1", "left"],
    ["q2", "left"],
    ["q3", "left"],
  ]);

  const note = buildRoomMatchingNote({
    room: buildRoom(),
    cycle: buildCycle(),
    score: 71.84,
    seekerScore: buildSeekerScore(),
    candidateScore: buildCandidateScore(),
    seekerUser: seeker,
    candidateUser: candidate,
    seekerAnswers,
    candidateAnswers,
    distanceKm: 2.345,
  });

  assert.equal(note.source, "location_room");
  assert.equal(note.version, "location_room");
  assert.equal(note.locationRoomTitle, "Indiranagar Evenings");
  assert.equal(note.totalScore, 71.84);
  assert.equal(note.distanceKm, 2.35);
  assert.equal(note.common.interests[0], "music");
  assert.equal(note.common.languages[0], "english");
  assert.equal(note.common.religion, "hindu");
  assert.equal(note.common.diet, "vegetarian");
  assert.equal(note.common.lifestyle.drinking, "never");
  assert.equal(note.thisOrThat.sharedAnswers, 3);
  assert.equal(note.thisOrThat.matchedAnswers, 2);
  assert.ok(note.reasons.includes("shared_interests"));
  assert.ok(note.reasons.includes("shared_languages"));
  assert.ok(note.reasons.includes("this_or_that_similarity"));
});

test("buildRoomMatchingNote tolerates missing user docs", () => {
  const note = buildRoomMatchingNote({
    room: buildRoom(),
    cycle: buildCycle(),
    score: 50,
    seekerScore: buildSeekerScore(),
    candidateScore: buildCandidateScore(),
    seekerUser: null,
    candidateUser: null,
    seekerAnswers: new Map(),
    candidateAnswers: new Map(),
    distanceKm: null,
  });
  assert.equal(note.common.interests.length, 0);
  assert.equal(note.common.religion, null);
  assert.equal(note.thisOrThat.matchedAnswers, 0);
  assert.deepEqual(note.reasons, ["room_pool_compatibility"]);
});

test("getCommonalityBreakdown handles missing fields safely", () => {
  const out = getCommonalityBreakdown({ seeker: null, candidate: null });
  assert.equal(out.interests.length, 0);
  assert.equal(out.religion, null);
  assert.equal(out.diet, null);
});

test("getThisOrThatStats reports zero overlap on empty inputs", () => {
  const out = getThisOrThatStats({
    seekerAnswers: new Map(),
    candidateAnswers: new Map(),
  });
  assert.equal(out.sharedAnswers, 0);
  assert.equal(out.matchedAnswers, 0);
  assert.equal(out.matchRate, 0);
});
