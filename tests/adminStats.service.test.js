import assert from "node:assert/strict";
import test from "node:test";
import CreditLedger from "../models/creditLedger.model.js";
import ThisOrThatQuestion from "../models/thisOrThatQuestion.model.js";
import User from "../models/user.model.js";
import { getAdminStatsData } from "../services/adminStats.service.js";

test("getAdminStatsData returns aggregated counts and the 30-day active total", async () => {
  const originals = {
    countDocuments: User.countDocuments,
    aggregate: User.aggregate,
    questionCount: ThisOrThatQuestion.countDocuments,
    creditAggregate: CreditLedger.aggregate,
  };

  User.countDocuments = async (filter) => {
    if (!Object.keys(filter).length) return 20;
    if (filter.isMatching) return 3;
    if (filter.isArchived === true) return 2;
    if (filter.lastActive?.$lte) return 5;
    if (filter.lastActive?.$gte) return 4;
    if (filter.$or?.some((condition) => condition.isVerified)) return 7;
    return 0;
  };
  User.aggregate = async () => [];
  ThisOrThatQuestion.countDocuments = async () => 1;
  CreditLedger.aggregate = async () => [
    { totalAwarded: 100, totalSpent: -25, transactions: 8 },
  ];

  try {
    const result = await getAdminStatsData({ now: new Date("2026-01-01T00:00:00Z") });
    assert.equal(result.success, true);
    assert.equal(result.data.totalUsers, 20);
    assert.equal(result.data.activeUsers, 5);
    assert.equal(result.data.inactiveUsers, 13);
    assert.equal(result.data.pendingQuestions, 1);
    assert.equal(result.data.credit.totalAwarded, 100);
    assert.equal(result.data.locationAnalytics.mode, "global");
  } finally {
    User.countDocuments = originals.countDocuments;
    User.aggregate = originals.aggregate;
    ThisOrThatQuestion.countDocuments = originals.questionCount;
    CreditLedger.aggregate = originals.creditAggregate;
  }
});
