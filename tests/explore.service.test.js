import test from "node:test";
import mongoose from "mongoose";
import assert from "node:assert/strict";
import express from "express";
import exploreRoutes from "../routes/explore.routes.js";
import CreditLedger from "../models/creditLedger.model.js";
import ExploreDaily from "../models/exploreDaily.model.js";
import User from "../models/user.model.js";
import UserPreference from "../models/preference.model.js";
import MatchRoom from "../models/room.model.js";
import Report from "../models/report.model.js";
import RejectedProfile from "../models/reject.model.js";
import ThisOrThatAnswer from "../models/thisOrThatAnswer.model.js";
import { debitExploreUnlock } from "../services/exploreCredits.service.js";
import { normalizePreference } from "../services/matchingPolicy.service.js";
import { scoreExploreCandidate } from "../services/exploreMatchingPolicy.service.js";
import { buildExploreCandidateQuery } from "../services/exploreCandidate.service.js";
import { rejectExploreProfile } from "../services/exploreRejection.service.js";
import { startExploreConversation } from "../services/exploreConversationCore.service.js";
import { getProfileCompatibility } from "../services/exploreCompatibility.service.js";
import { getAge } from "../utils/age.js";
import { getDailyExplore, unlockDailyExplore } from "../services/explore.service.js";
import {
  projectExploreProfile,
  exploreNoteFacts,
  fallbackExploreNote,
} from "../services/exploreProfile.service.js";

const NOW = new Date("2026-10-03T12:00:00Z");
const id = (n) => n.toString(16).padStart(24, "0");
const USER_ID = id(1);
const copy = (value) => structuredClone(value);
const chain = (value) => ({
  select() { return this; },
  session() { return this; },
  lean: async () => copy(value),
  then: (resolve, reject) => Promise.resolve(copy(value)).then(resolve, reject),
});
const prefs = (extra = {}) => normalizePreference({ interestedIn: "woman", ageRange: [20, 30],
  goal: { primary: "long_term" }, relationshipType: "monogamy", distance: 10, ...extra });
const seeker = () => ({ _id: USER_ID, username: "seeker", gender: "man", dob: new Date("2000-01-01"),
  credits: 10, interests: ["hiking"], languages: ["english"], location: { coordinates: [77, 12] } });
const candidate = (n, extra = {}) => ({ _id: id(n), nickname: `Person ${n}`, gender: "woman",
  dob: new Date("2001-01-01"), interests: ["hiking"], languages: ["english"],
  location: { coordinates: [77, 12 + n / 1000] }, ...extra });
const score = (distanceKm, candidatePrefs = prefs(), interests = []) => scoreExploreCandidate({
  seeker: seeker(), candidate: { interests }, distanceKm,
  context: { seekerPrefs: prefs(), candidatePrefs, seekerAnswers: new Map(), candidateAnswers: new Map() },
});

test("Explore prioritizes proximity and goals; missing data supplies no evidence", () => {
  assert.ok(score(1).score > score(100, prefs({ goal: { primary: "friendship" }, relationshipType: "other" }), ["hiking"]).score);
  assert.ok(score(5).score > score(50).score);
  assert.ok(score(5).components.goals > score(5, prefs({ goal: { primary: "friendship" } })).components.goals);
  const empty = score(null, prefs({ goal: {}, relationshipType: null }));
  assert.equal(empty.components.distance, 0);
  assert.equal(empty.components.goals, 0);
  assert.equal(empty.components.thisOrThat, 0);
  assert.equal(empty.score, 0);
});

test("Explore scoring uses five equal 20-point categories", () => {
  const user = { ...seeker(), religion: "hindu", diet: "vegan" };
  const match = { ...candidate(2), religion: "hindu", diet: "vegan" };
  const preferences = prefs({ religionPreference: ["hindu"], dietPreference: ["vegan"] });
  const answers = new Map(Array.from({ length: 20 }, (_, index) => [`q${index}`, "a"]));
  const result = scoreExploreCandidate({
    seeker: user,
    candidate: match,
    distanceKm: 0,
    context: {
      seekerPrefs: preferences,
      candidatePrefs: preferences,
      seekerAnswers: answers,
      candidateAnswers: answers,
    },
  });

  assert.deepEqual(result.components, {
    distance: 20,
    goals: 20,
    preferences: 20,
    interests: 10,
    languages: 10,
    thisOrThat: 20,
  });
  assert.equal(result.score, 100);
});

test("gender/age filters honor inclusive birthdays without online, distance, or credit gates", () => {
  const query = buildExploreCandidateQuery({ userId: USER_ID, prefs: prefs(), excludedIds: [id(9)], now: NOW });
  assert.deepEqual(query.gender, { $in: ["woman"] });
  assert.equal(query.dob.$gte.toISOString(), "1995-10-04T00:00:00.000Z");
  assert.equal(query.dob.$lt.toISOString(), "2006-10-04T00:00:00.000Z");
  assert.equal(getAge("2006-10-03", NOW), 20);
  assert.equal(getAge("2006-10-04", NOW), 19);
  assert.equal(getAge("1995-10-04", NOW), 30);
  assert.equal(getAge("1995-10-03", NOW), 31);
  assert.equal(query._id.$nin.length, 2);
  for (const key of ["isMatching", "isActive", "credits", "location"]) assert.equal(query[key], undefined);
  const leap = buildExploreCandidateQuery({ userId: USER_ID, prefs: prefs({ ageRange: [18, 18] }), excludedIds: [], now: new Date("2024-02-29") });
  assert.equal(leap.dob.$lt.toISOString(), "2006-03-01T00:00:00.000Z");
});

test("preview and explanation facts omit private and unlocked fields and all contact credentials", () => {
  const user = candidate(2, { nickname: "Hidden", email: "private@example.test", realName: "Secret",
    password: "secret", explorePayment: { balanceAfter: 9 },
    fieldVisibility: { nickname: "private", interests: "unlocked", dob: "private", location: "private", goal: "private" } });
  const projected = projectExploreProfile(user, NOW);
  for (const field of ["email", "password", "realName", "username", "explorePayment", "nickname", "interests", "dob", "age", "location"]) {
    assert.equal(projected[field], undefined);
  }
  const facts = exploreNoteFacts({ seeker: seeker(), seekerPrefs: prefs(), candidate: user, candidatePrefs: prefs() });
  assert.equal(facts.name, "this person");
  assert.equal(facts.distanceKm, null);
  assert.deepEqual(facts.common.goals, []);
  assert.deepEqual(facts.common.interests, []);
  const note = fallbackExploreNote(facts);
  assert.ok(!note.includes("Hidden"));
  assert.match(note, /^Meet this person\./);
  assert.ok(!note.includes("age and gender preferences"));
});

// Model doubles enforce the same conditional filters to exercise retry/crash interleavings.
const matches = (doc, query) => Object.entries(query).every(([key, expected]) => {
  if (key === "$or") return expected.some((item) => matches(doc, item));
  const value = key.split(".").reduce((obj, part) => obj?.[part], doc);
  if (expected === null) return value == null;
  if (expected && typeof expected === "object" && !(expected instanceof Date) && !expected.toHexString) {
    return Object.entries(expected).every(([op, target]) => {
      if (op === "$in") return target.some((v) => String(v) === String(value));
      if (op === "$nin") return !target.some((v) => String(v) === String(value));
      if (op === "$ne") return value !== target;
      if (op === "$lt") return value < target;
      if (op === "$lte") return value <= target;
      if (op === "$gte") return value >= target;
      throw new Error(`Unsupported test filter ${op}`);
    });
  }
  return String(value) === String(expected);
});

const harness = (t, candidates = [candidate(2)]) => {
  const state = { user: seeker(), candidates, daily: null, ledger: new Map(), debits: 0, generations: 0,
    prefs: candidates.map((user) => ({ user: user._id, goal: { primary: "long_term" }, relationshipType: "monogamy" })),
    reports: [], rejections: [], rooms: [], failLedger: false,
    fetchProvider: async () => { throw new Error("Test provider unavailable"); } };
  // Never contact the provider during local tests, even if the shell has a real API key.
  t.mock.method(globalThis, "fetch", (...args) => state.fetchProvider(...args));
  t.mock.method(ExploreDaily, "init", async () => {});
  t.mock.method(CreditLedger, "init", async () => {});
  t.mock.method(User, "findById", () => chain(state.user));
  t.mock.method(User, "aggregate", (pipeline) => {
    state.generations += 1;
    assert.deepEqual(pipeline[1], { $sort: { lastActive: -1, _id: -1 } });
    assert.equal(pipeline[2].$limit, 100);
    const limit = pipeline[2].$limit;
    return Promise.resolve(copy(state.candidates
      .filter((user) => matches(user, pipeline[0].$match))
      .sort((a, b) => (b.lastActive?.getTime() ?? 0) - (a.lastActive?.getTime() ?? 0) || String(b._id).localeCompare(String(a._id)))
      .slice(0, limit)));
  });
  t.mock.method(User, "find", (query) => chain(state.candidates.filter((user) => matches(user, query))));
  t.mock.method(User, "findOneAndUpdate", (query, update) => {
    if (!matches(state.user, query)) return chain(null);
    if (!Array.isArray(update)) {
      state.user.credits += update.$inc.credits;
      return chain(state.user);
    }
    const payment = update[0].$set.explorePayment;
    state.user.credits -= 1;
    state.user.explorePayment = { ...payment, balanceAfter: state.user.credits };
    state.debits += 1;
    return chain(state.user);
  });
  t.mock.method(User, "updateOne", async (query) => {
    if (!matches(state.user, query)) return { matchedCount: 0 };
    state.user.explorePayment.settled = true;
    return { matchedCount: 1 };
  });
  t.mock.method(UserPreference, "findOne", (query) => chain(String(query.user) === USER_ID
    ? { interestedIn: "woman", ageRange: [20, 30], goal: { primary: "long_term" }, distance: 10 }
    : state.prefs.find((doc) => String(doc.user) === String(query.user)) || null));
  t.mock.method(UserPreference, "find", () => chain(state.prefs));
  t.mock.method(MatchRoom, "find", () => chain(state.rooms));
  t.mock.method(Report, "find", () => chain(state.reports));
  t.mock.method(RejectedProfile, "find", () => chain(state.rejections));
  t.mock.method(RejectedProfile, "findOneAndUpdate", async (query, update) => {
    const rejection = { ...query, ...update.$set };
    state.rejections.push(rejection);
    return copy(rejection);
  });
  t.mock.method(ThisOrThatAnswer, "find", () => chain([]));
  t.mock.method(ExploreDaily, "findOne", (query) => chain(state.daily && matches(state.daily, query) ? state.daily : null));
  t.mock.method(ExploreDaily, "create", async (data) => {
    if (state.daily && matches(state.daily, { user: data.user, dayKey: data.dayKey })) throw Object.assign(new Error("Duplicate daily"), { code: 11000 });
    state.daily = { _id: id(999), amountPaid: 0, profiles: [], ...data };
    return { toObject: () => copy(state.daily) };
  });
  t.mock.method(ExploreDaily, "findOneAndUpdate", (query, update) => {
    if (!state.daily || !matches(state.daily, query)) return chain(null);
    Object.assign(state.daily, update.$set);
    return chain(state.daily);
  });
  t.mock.method(ExploreDaily, "updateOne", async (query, update) => {
    if (!state.daily || !matches(state.daily, query)) return { matchedCount: 0 };
    Object.assign(state.daily, update.$set);
    return { matchedCount: 1 };
  });
  t.mock.method(CreditLedger, "updateOne", async (query, update) => {
    if (state.failLedger) { state.failLedger = false; throw new Error("Ledger unavailable"); }
    if (!state.ledger.has(query.referenceId)) state.ledger.set(query.referenceId, update.$setOnInsert);
    return { matchedCount: 1 };
  });
  return state;
};

test("unlock scores 100 eligible offline profiles, returns the top 10, and caches one paid list", async (t) => {
  const state = harness(t, Array.from({ length: 100 }, (_, i) => candidate(i + 2, { isActive: false, isMatching: false, credits: 0 })));
  const result = await unlockDailyExplore({ userId: USER_ID, now: NOW });
  assert.equal(result.candidateCount, 100);
  assert.equal(result.profiles.length, 10);
  assert.equal(result.profiles[0]._id, id(2));
  assert.equal(result.profiles[0].distanceKm, 0.2);
  assert.ok(result.profiles.every((profile, i) => i === 0 || profile.score <= result.profiles[i - 1].score));
  assert.ok(result.profiles.every((profile) => typeof profile.matchNote === "string"));
  assert.equal(result.amountPaid, 1);
  assert.equal(state.user.credits, 9);
  const again = await unlockDailyExplore({ userId: USER_ID, now: NOW });
  assert.deepEqual(again.profiles, result.profiles);
  assert.equal(state.generations, 1);
  assert.equal(state.debits, 1);
  assert.equal(state.ledger.size, 1);
});

test("Explore retrieves the 100 most recently active eligible profiles", async (t) => {
  const candidates = Array.from({ length: 120 }, (_, i) => candidate(i + 2));
  candidates[119].lastActive = new Date("2026-10-03T11:59:00Z");
  candidates[119].location.coordinates = [77, 12.0001];
  const state = harness(t, candidates);

  const result = await unlockDailyExplore({ userId: USER_ID, now: NOW });

  assert.equal(result.candidateCount, 100);
  assert.equal(result.profiles.length, 10);
  assert.equal(result.profiles[0]._id, id(121));
});

test("concurrent unlocks and debit retries charge once", async (t) => {
  const state = harness(t);
  const results = await Promise.all(Array.from({ length: 8 }, () => unlockDailyExplore({ userId: USER_ID, now: NOW })));
  assert.ok(results.every((r) => ["generating", "ready"].includes(r.status)));
  const receipt = await debitExploreUnlock({ userId: USER_ID, dayKey: "2026-10-03", referenceId: `explore:${USER_ID}:2026-10-03` });
  assert.equal(receipt.balanceAfter, 9);
  assert.equal(state.debits, 1);
  assert.equal(state.ledger.size, 1);
});

test("failed ledger write is recovered on read without another debit", async (t) => {
  const state = harness(t);
  state.failLedger = true;
  await assert.rejects(unlockDailyExplore({ userId: USER_ID, now: NOW }), /Ledger unavailable/);
  assert.equal(state.user.credits, 9);
  assert.equal(state.user.explorePayment.settled, false);
  assert.equal(state.daily.status, "prepared");
  const recovered = await getDailyExplore({ userId: USER_ID, now: NOW });
  assert.equal(recovered.status, "ready");
  assert.equal(state.user.explorePayment.settled, true);
  assert.equal(state.debits, 1);
  assert.equal(state.ledger.size, 1);
});

test("empty pool is free; insufficient funds do not generate or debit", async (t) => {
  const state = harness(t, []);
  assert.equal((await unlockDailyExplore({ userId: USER_ID, now: NOW })).status, "empty");
  assert.equal(state.debits, 0);
  assert.equal(state.ledger.size, 0);
  state.daily = null;
  state.user.credits = 0;
  await assert.rejects(unlockDailyExplore({ userId: USER_ID, now: NOW }), { code: "INSUFFICIENT_CREDITS" });
  assert.equal(state.generations, 1);
});

test("gender/age exclusions, existing chats and bilateral reports/rejections are applied before selection", async (t) => {
  const state = harness(t, [candidate(2), candidate(3), candidate(4), candidate(5),
    candidate(6, { gender: "man" }), candidate(7, { dob: new Date("2010-01-01") }), candidate(8, { isArchived: true })]);
  state.rooms = [{ participants: [USER_ID, id(3)] }];
  state.reports = [{ reporter: id(4), reportedUser: USER_ID }];
  state.rejections = [{ user: USER_ID, rejectedUser: id(5) }];
  const result = await unlockDailyExplore({ userId: USER_ID, now: NOW });
  assert.equal(result.candidateCount, 1);
  assert.deepEqual(result.profiles.map((profile) => profile._id), [id(2)]);
});

test("cached cards honor new reports and visibility changes without exposing the saved note", async (t) => {
  const state = harness(t, [candidate(2), candidate(3)]);
  await unlockDailyExplore({ userId: USER_ID, now: NOW });
  state.reports = [{ reporter: USER_ID, reportedUser: id(3) }];
  const stored = state.daily.profiles.find((profile) => profile.user === id(2));
  stored.matchNote = "Private hiking detail";
  stored.noteStatus = "generated";
  state.candidates[0].fieldVisibility = { interests: "private", location: "private", goal: "private" };
  const result = await getDailyExplore({ userId: USER_ID, now: NOW });
  assert.equal(result.profiles.length, 1);
  assert.equal(result.profiles[0].interests, undefined);
  assert.equal(result.profiles[0].noteStatus, "fallback");
  assert.ok(!result.profiles[0].matchNote.includes("hiking"));
  assert.equal(state.debits, 1);
});

test("expired generation can retry and tomorrow has a separate unlock", async (t) => {
  const state = harness(t);
  state.daily = { _id: id(999), user: USER_ID, dayKey: "2026-10-03", status: "generating", leaseUntil: new Date("2026-10-03T11:00:00Z"), profiles: [] };
  await unlockDailyExplore({ userId: USER_ID, now: NOW });
  const tomorrow = await unlockDailyExplore({ userId: USER_ID, now: new Date("2026-10-04T00:00:00Z") });
  assert.equal(tomorrow.dayKey, "2026-10-04");
  assert.equal(state.debits, 2);
  assert.equal(state.ledger.size, 2);
});

test("GET before unlock performs no generation or debit", async (t) => {
  const state = harness(t);
  const result = await getDailyExplore({ userId: USER_ID, now: NOW });
  assert.equal(result.status, "locked");
  assert.equal(result.unlocked, false);
  assert.deepEqual(result.profiles, []);
  assert.equal(result.resetAt.toISOString(), "2026-10-04T00:00:00.000Z");
  assert.equal(state.generations, 0);
  assert.equal(state.debits, 0);
});

test("a previous-day request cannot debit after today's receipt", async (t) => {
  const state = harness(t);
  await unlockDailyExplore({ userId: USER_ID, now: NOW });
  await assert.rejects(debitExploreUnlock({ userId: USER_ID, dayKey: "2026-10-02", referenceId: "yesterday" }),
    { code: "EXPLORE_PAYMENT_PENDING" });
  assert.equal(state.debits, 1);
});

test("unfinished receipt prevents a new day from charging until recovery succeeds", async (t) => {
  const state = harness(t);
  state.user.explorePayment = { dayKey: "2026-10-02", referenceId: "previous", balanceAfter: 9, settled: false };
  await assert.rejects(debitExploreUnlock({ userId: USER_ID, dayKey: "2026-10-03", referenceId: "today" }),
    { code: "EXPLORE_PAYMENT_PENDING" });
  assert.equal(state.debits, 0);
});

test("Explore endpoints require authentication", async (t) => {
  const app = express();
  app.use("/api/explore", exploreRoutes);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/explore`;
  for (const [path, method] of [["", "GET"], ["/unlock", "POST"], [`/profiles/${id(2)}/conversation`, "POST"], [`/profiles/${id(2)}/reject`, "POST"]]) {
    const response = await fetch(url + path, { method });
    assert.equal(response.status, 401);
    assert.match((await response.json()).message, /no token/i);
  }
});

test("rejecting an unlocked Explore profile stores private feedback and removes it from the list", async (t) => {
  const state = harness(t);
  await unlockDailyExplore({ userId: USER_ID, now: NOW });
  const result = await rejectExploreProfile({
    userId: USER_ID, profileId: id(2), reason: "different_intentions", feedback: "Looking for different things", now: NOW,
  });
  assert.equal(result.profileId, id(2));
  assert.equal(state.rejections[0].reason, "different_intentions");
  assert.equal(state.rejections[0].feedback, "Looking for different things");
  assert.equal((await getDailyExplore({ userId: USER_ID, now: NOW })).profiles.length, 0);
  await assert.rejects(rejectExploreProfile({
    userId: USER_ID, profileId: id(3), reason: "other", now: NOW,
  }), { code: "PROFILE_NOT_UNLOCKED" });
  await assert.rejects(rejectExploreProfile({
    userId: USER_ID, profileId: id(2), reason: "invalid", now: NOW,
  }), { code: "INVALID_REJECTION_REASON" });
});

const mockConversationRooms = (t, state) => {
  t.mock.method(MatchRoom, "init", async () => {});
  t.mock.method(User, "findOne", (query) => chain(state.candidates.find((user) => matches(user, query)) || null));
  t.mock.method(MatchRoom, "findOne", (query) => {
    const room = state.rooms.find((item) => query.directExplorePairKey
      ? item.directExplorePairKey === query.directExplorePairKey
      : query.participants.$all.every((userId) => item.participants.includes(String(userId))));
    return { ...chain(room || null), then: (resolve, reject) => Promise.resolve(room || null).then(resolve, reject) };
  });
  t.mock.method(MatchRoom, "findOneAndUpdate", async (query, update) => {
    let room = state.rooms.find((item) => item.directExplorePairKey === query.directExplorePairKey);
    const updatedExisting = Boolean(room);
    if (!room) {
      room = { _id: id(500), ...copy(update.$setOnInsert), ...query };
      state.rooms.push(room);
    }
    return { value: room, lastErrorObject: { updatedExisting } };
  });
};

const mockConversationBilling = (t, state) => {
  t.mock.method(mongoose, "startSession", async () => ({
    startTransaction() {},
    inTransaction: () => true,
    commitTransaction: async () => {},
    abortTransaction: async () => {},
    endSession: async () => {},
  }));
  let ledgerSequence = 700;
  t.mock.method(CreditLedger, "findOne", (query) => chain(
    [...state.ledger.values()].find((entry) => matches(entry, query)) || null,
  ));
  t.mock.method(CreditLedger, "create", async (entries) => {
    const ledgers = (Array.isArray(entries) ? entries : [entries]).map((entry) => {
      const ledger = { _id: id(ledgerSequence++), ...copy(entry) };
      state.ledger.set(ledger._id, ledger);
      return ledger;
    });
    return Array.isArray(entries) ? ledgers : ledgers[0];
  });
  t.mock.method(CreditLedger, "findOneAndDelete", async (query) => {
    const ledger = [...state.ledger.values()].find((entry) => matches(entry, query));
    if (ledger) state.ledger.delete(String(ledger._id));
    return ledger || null;
  });
  t.mock.method(User, "findByIdAndUpdate", async (_userId, update) => {
    state.user.credits += update.$inc.credits;
    return copy(state.user);
  });
};

test("chosen-profile conversations require a paid daily selection and reject arbitrary profiles", async (t) => {
  const state = harness(t);
  mockConversationRooms(t, state);
  await assert.rejects(startExploreConversation({ userId: USER_ID, profileId: id(2), now: NOW }), { code: "PROFILE_NOT_UNLOCKED" });
  await unlockDailyExplore({ userId: USER_ID, now: NOW });
  await assert.rejects(startExploreConversation({ userId: USER_ID, profileId: id(3), now: NOW }), { code: "PROFILE_NOT_UNLOCKED" });
  assert.equal(state.rooms.length, 0);
});

test("concurrent Say hello requests reuse one room and retain only one conversation charge", async (t) => {
  const state = harness(t);
  mockConversationRooms(t, state);
  await unlockDailyExplore({ userId: USER_ID, now: NOW });
  mockConversationBilling(t, state);
  const results = await Promise.all([1, 2].map(() => startExploreConversation({ userId: USER_ID, profileId: id(2), now: NOW })));
  assert.equal(results[0].roomId, results[1].roomId);
  assert.deepEqual(results.map((result) => result.created).sort(), [false, true]);
  assert.equal(state.rooms.length, 1);
  assert.equal(state.rooms[0].source, "explore");
  assert.equal(state.debits, 1);
  assert.equal(state.user.credits, 8);
  assert.equal(state.ledger.size, 2);
  const retry = await startExploreConversation({ userId: USER_ID, profileId: id(2), now: NOW });
  assert.equal(retry.roomId, results[0].roomId);
  assert.equal(retry.created, false);
  assert.equal(state.user.credits, 8);
});

test("cached notes discard profile details when a previously public field becomes private", async (t) => {
  const state = harness(t, [candidate(2, { bio: "Distinctive private detail", work: "designer" })]);
  await unlockDailyExplore({ userId: USER_ID, now: NOW });
  state.daily.profiles[0].matchNote = "Meet Person 2, a designer. Distinctive private detail.";
  state.daily.profiles[0].noteStatus = "generated";
  state.candidates[0].fieldVisibility = { bio: "private", work: "private" };

  const result = await getDailyExplore({ userId: USER_ID, now: NOW });
  assert.equal(result.profiles[0].noteStatus, "fallback");
  assert.doesNotMatch(result.profiles[0].matchNote, /designer|Distinctive private detail/);
  assert.equal(state.generations, 1);
});

test("changed candidate preferences exclude cached cards, compatibility checks and new conversations", async (t) => {
  const state = harness(t);
  mockConversationRooms(t, state);
  await unlockDailyExplore({ userId: USER_ID, now: NOW });
  state.prefs[0].ageRange = [40, 50];

  assert.equal((await getDailyExplore({ userId: USER_ID, now: NOW })).profiles.length, 0);
  await assert.rejects(getProfileCompatibility({ userId: USER_ID, profileId: id(2), now: NOW }), { code: "PROFILE_UNAVAILABLE" });
  await assert.rejects(startExploreConversation({ userId: USER_ID, profileId: id(2), now: NOW }), { code: "PROFILE_UNAVAILABLE" });
  assert.equal(state.rooms.length, 0);
  assert.equal(state.debits, 1);
});

test("Say hello rechecks reports, archive state and daily expiry", async (t) => {
  const state = harness(t);
  mockConversationRooms(t, state);
  await unlockDailyExplore({ userId: USER_ID, now: NOW });
  state.reports.push({ reporter: id(2), reportedUser: USER_ID });
  await assert.rejects(startExploreConversation({ userId: USER_ID, profileId: id(2), now: NOW }), { code: "PROFILE_UNAVAILABLE" });
  state.reports = [];
  state.rooms.push({ _id: id(500), participants: [USER_ID, id(2)], status: "archive" });
  await assert.rejects(startExploreConversation({ userId: USER_ID, profileId: id(2), now: NOW }), { code: "CHAT_ARCHIVED" });
  await assert.rejects(startExploreConversation({ userId: USER_ID, profileId: id(2), now: new Date("2026-10-04T00:00:00Z") }), { code: "PROFILE_NOT_UNLOCKED" });
  assert.equal(state.debits, 1);
});

test("AI receives only approved public facts for the top ten, with a bounded timeout, and notes are cached", async (t) => {
  const state = harness(t, Array.from({ length: 100 }, (_, i) => candidate(i + 2)));
  const previousKey = process.env.NVIDIA_API_KEY;
  process.env.NVIDIA_API_KEY = "test-key";
  t.after(() => { if (previousKey === undefined) delete process.env.NVIDIA_API_KEY; else process.env.NVIDIA_API_KEY = previousKey; });
  state.candidates[0].email = "hidden-email@example.test";
  state.candidates[0].fieldVisibility = { interests: "private", nickname: "private", location: "private", goal: "private", languages: "private" };
  const calls = [];
  state.fetchProvider = async (input, init) => {
    const request = new Request(input, init);
    const payload = await request.json();
    calls.push({ url: request.url, payload, signal: request.signal });
    const name = payload.messages[1].content.match(/Suggested person name: ([^\n]+)/)[1];
    return new Response(JSON.stringify({ choices: [{ message: { content: `Meet ${name}, someone whose profile could be an interesting place to start. The information we have gives you a little common ground to explore, and you may find a good conversation waiting there, so take a look and see what stands out to you.` } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const result = await unlockDailyExplore({ userId: USER_ID, now: NOW });
  assert.equal(calls.length, 10);
  assert.ok(result.profiles.every((profile) => profile.noteStatus === "generated"));
  assert.equal(result.profiles.find((profile) => profile._id === id(2)).distanceKm, null);
  const serialized = JSON.stringify(calls.map((call) => call.payload));
  assert.ok(!serialized.includes("hidden-email@example.test"));
  assert.ok(!serialized.includes(USER_ID));
  assert.ok(!serialized.includes(id(2)));
  const privateCall = calls.find((call) => call.payload.messages[1].content.includes("Suggested person name: this person"));
  assert.ok(privateCall);
  const content = privateCall.payload.messages[1].content;
  assert.ok(!content.includes("Person 2"));
  const payload = JSON.parse(content.split("Match data JSON: ")[1]);
  assert.equal(payload.suggestedPerson.profile.interests, undefined);
  assert.deepEqual(payload.suggestedPerson.preferences.goals, []);
  assert.ok(content.includes('"distanceKm":null'));
  assert.ok(calls.every((call) => call.signal instanceof AbortSignal));
  assert.ok(calls.every((call) => call.url === "https://integrate.api.nvidia.com/v1/chat/completions"));
  await getDailyExplore({ userId: USER_ID, now: NOW });
  await unlockDailyExplore({ userId: USER_ID, now: NOW });
  assert.equal(calls.length, 10);
});

test("provider failures still deliver a paid list with factual fallback notes", async (t) => {
  const state = harness(t);
  const previousKey = process.env.NVIDIA_API_KEY;
  process.env.NVIDIA_API_KEY = "test-key";
  t.after(() => { if (previousKey === undefined) delete process.env.NVIDIA_API_KEY; else process.env.NVIDIA_API_KEY = previousKey; });
  const result = await unlockDailyExplore({ userId: USER_ID, now: NOW });
  assert.equal(result.profiles[0].noteStatus, "fallback");
  assert.match(result.profiles[0].matchNote, /^Meet Person \d+\./);
  assert.match(result.profiles[0].matchNote, /nearby/);
  assert.equal(state.debits, 1);
});

test("a generation crossing UTC midnight does not debit the expired day's list", async (t) => {
  const state = harness(t);
  let clockReads = 0;
  t.mock.method(Date, "now", () => clockReads++ === 0 ? 1000 : 2000);
  await assert.rejects(unlockDailyExplore({ userId: USER_ID, now: new Date("2026-10-03T23:59:59.500Z") }),
    { code: "EXPLORE_DAY_EXPIRED" });
  assert.equal(state.debits, 0);
});

test("Mongoose forwards a valid atomic debit pipeline and includes the hidden receipt", async (t) => {
  t.mock.method(User, "findById", () => chain(seeker()));
  let driverCalls = 0;
  t.mock.method(User.collection, "findOneAndUpdate", async (query, update, options) => {
    driverCalls += 1;
    assert.equal(String(query._id), USER_ID);
    assert.equal(query.credits.$gte, 1);
    assert.deepEqual(update[0].$set.credits, { $subtract: ["$credits", 1] });
    assert.deepEqual(update[0].$set.explorePayment.balanceAfter, { $subtract: ["$credits", 1] });
    assert.equal(options.projection.explorePayment, 1);
    return { _id: seeker()._id, credits: 9,
      explorePayment: { dayKey: "2026-10-03", referenceId: "receipt", balanceAfter: 9, settled: false } };
  });
  const receipt = await debitExploreUnlock({ userId: USER_ID, dayKey: "2026-10-03", referenceId: "receipt" });
  assert.equal(driverCalls, 1);
  assert.equal(receipt.balanceAfter, 9);
});
