import assert from "node:assert/strict";
import test from "node:test";
import axios from "axios";

import {
  buildMatchNote,
  generateMatchNote,
  generateMatchNotesByUser,
} from "../services/matchNote.service.js";

const buildMatchingNote = () => ({
  version: "location_room",
  source: "location_room",
  totalScore: 72.5,
  common: {
    interests: ["music", "travel"],
    languages: ["english"],
    goals: [],
    religion: "Hindu",
    diet: "vegetarian",
    lifestyle: { drinking: "never", smoking: "never", pets: null },
  },
  thisOrThat: {
    sharedAnswers: 3,
    matchedAnswers: 2,
    matchRate: 66.67,
  },
  reasons: ["shared_interests", "this_or_that_similarity"],
  components: {
    profileScore: 38,
    intentScore: 18,
    thisOrThatScore: 9,
    distanceScore: 5,
  },
});

const buildUsers = (seekerId, candidateId) => [
  { _id: seekerId, username: "seeker_user", nickname: "Seeker" },
  { _id: candidateId, username: "candidate_user", nickname: "Candidate" },
];

test("buildMatchNote returns the original note when matchingNote is missing", async () => {
  const out = await buildMatchNote({
    seekerId: "u1",
    candidateId: "u2",
    matchingNote: null,
    loadUsers: async () => [],
  });
  assert.equal(out, null);
});

test("buildMatchNote returns envelope with deterministic fallback sentence", async () => {
  const out = await buildMatchNote({
    seekerId: "64a000000000000000000001",
    candidateId: "64a000000000000000000002",
    matchingNote: buildMatchingNote(),
    loadUsers: async ({ seekerId, candidateId }) =>
      buildUsers(seekerId, candidateId),
  });

  // Fallback template runs because no NVIDIA_API_KEY is set in CI.
  assert.equal(typeof out.oneSentenceNote, "string");
  assert.ok(out.oneSentenceNote.length > 0);
  assert.equal(out.aiSummary.usedFallback, true);
  assert.equal(out.aiSummary.provider, "fallback");
  assert.equal(typeof out.aiSummary.generatedAt, "string");
  assert.ok(typeof out.notesByUser === "object" && out.notesByUser !== null);
  // The original structural fields are preserved.
  assert.equal(out.source, "location_room");
  assert.equal(out.totalScore, 72.5);
});

test("buildMatchNote passes through original structural fields", async () => {
  const structuralNote = buildMatchingNote();
  const out = await buildMatchNote({
    seekerId: "64a000000000000000000001",
    candidateId: "64a000000000000000000002",
    matchingNote: structuralNote,
    loadUsers: async () => [],
  });
  assert.equal(out.version, structuralNote.version);
  assert.equal(out.totalScore, structuralNote.totalScore);
  assert.deepEqual(out.common, structuralNote.common);
  assert.deepEqual(out.thisOrThat, structuralNote.thisOrThat);
});

test("buildMatchNote swallows loadUsers errors and falls back", async () => {
  const out = await buildMatchNote({
    seekerId: "64a000000000000000000001",
    candidateId: "64a000000000000000000002",
    matchingNote: buildMatchingNote(),
    loadUsers: async () => {
      throw new Error("db down");
    },
  });
  // Fallback template should still produce a sentence even when user load fails.
  assert.equal(typeof out.oneSentenceNote, "string");
  assert.ok(out.oneSentenceNote.length > 0);
});

test("single and paired notes share the configured NVIDIA request", async () => {
  const originalPost = axios.post;
  const originalApiKey = process.env.NVIDIA_API_KEY;
  const originalTimeout = process.env.NVIDIA_MATCH_NOTE_TIMEOUT_MS;
  const calls = [];
  process.env.NVIDIA_API_KEY = "test-key";
  process.env.NVIDIA_MATCH_NOTE_TIMEOUT_MS = "12000";
  axios.post = async (...args) => {
    calls.push(args);
    const content = calls.length === 1
      ? "You should talk to Candidate because you share music."
      : JSON.stringify({
          seekerNote: "You should talk to Candidate because you share music.",
          candidateNote: "You should talk to Seeker because you share music.",
        });
    return { data: { choices: [{ message: { content } }] } };
  };

  try {
    await generateMatchNote({
      viewer: { nickname: "Seeker" },
      otherUser: { nickname: "Candidate" },
      matchingNote: buildMatchingNote(),
      timeoutMs: 2500,
    });
    await generateMatchNotesByUser({
      seeker: { _id: "u1", nickname: "Seeker" },
      candidate: { _id: "u2", nickname: "Candidate" },
      matchingNote: buildMatchingNote(),
    });

    assert.equal(calls.length, 2);
    assert.equal(calls[0][2].headers.Authorization, "Bearer test-key");
    assert.equal(calls[0][2].timeout, 2500);
    assert.equal(calls[1][2].timeout, 12000);
    assert.equal(calls[0][1].max_tokens, calls[1][1].max_tokens);
  } finally {
    axios.post = originalPost;
    if (originalApiKey === undefined) delete process.env.NVIDIA_API_KEY;
    else process.env.NVIDIA_API_KEY = originalApiKey;
    if (originalTimeout === undefined) delete process.env.NVIDIA_MATCH_NOTE_TIMEOUT_MS;
    else process.env.NVIDIA_MATCH_NOTE_TIMEOUT_MS = originalTimeout;
  }
});
