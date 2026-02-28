import test from "node:test";
import assert from "node:assert/strict";
import CreditLedger from "../models/creditLedger.model.js";
import User from "../models/user.model.js";
import {
  CREDIT_RULES,
  claimRewardedAdCredit,
  getNextUtcDayStart,
  getRewardedAdQuotaFromClaims,
  getUtcDayStart,
} from "../services/credits.service.js";

test("getUtcDayStart normalizes to UTC midnight", () => {
  const date = new Date("2026-02-14T18:33:22.000Z");
  const dayStart = getUtcDayStart(date);

  assert.equal(dayStart.toISOString(), "2026-02-14T00:00:00.000Z");
});

test("getNextUtcDayStart returns next UTC day midnight", () => {
  const date = new Date("2026-02-14T18:33:22.000Z");
  const nextDayStart = getNextUtcDayStart(date);

  assert.equal(nextDayStart.toISOString(), "2026-02-15T00:00:00.000Z");
});

test("getRewardedAdQuotaFromClaims counts only rolling 60-minute claims", () => {
  const now = new Date("2026-03-01T12:00:00.000Z");
  const claims = [
    { createdAt: new Date("2026-03-01T11:50:00.000Z") },
    { createdAt: new Date("2026-03-01T11:20:00.000Z") },
    { createdAt: new Date("2026-03-01T10:30:00.000Z") },
  ];

  const quota = getRewardedAdQuotaFromClaims(claims, now);

  assert.equal(quota.rewardedAdsWatchedInWindow, 2);
  assert.equal(
    quota.rewardedAdsRemainingInWindow,
    CREDIT_RULES.REWARDED_AD_MAX_PER_HOUR - 2,
  );
  assert.equal(quota.rewardedAdsNextEligibleAt, null);
});

test("getRewardedAdQuotaFromClaims returns capped state at max", () => {
  const now = new Date("2026-03-01T12:00:00.000Z");
  const claims = [
    { createdAt: new Date("2026-03-01T11:10:00.000Z") },
    { createdAt: new Date("2026-03-01T11:20:00.000Z") },
    { createdAt: new Date("2026-03-01T11:30:00.000Z") },
  ];

  const quota = getRewardedAdQuotaFromClaims(claims, now);

  assert.equal(
    quota.rewardedAdsWatchedInWindow,
    CREDIT_RULES.REWARDED_AD_MAX_PER_HOUR,
  );
  assert.equal(quota.rewardedAdsRemainingInWindow, 0);
  assert.equal(
    quota.rewardedAdsNextEligibleAt?.toISOString(),
    "2026-03-01T12:10:00.000Z",
  );
});

test("getRewardedAdQuotaFromClaims excludes claim at exact window boundary", () => {
  const now = new Date("2026-03-01T12:00:00.000Z");
  const claims = [
    { createdAt: new Date("2026-03-01T11:00:00.000Z") },
    { createdAt: new Date("2026-03-01T11:01:00.000Z") },
  ];

  const quota = getRewardedAdQuotaFromClaims(claims, now);

  assert.equal(quota.rewardedAdsWatchedInWindow, 1);
  assert.equal(
    quota.rewardedAdsRemainingInWindow,
    CREDIT_RULES.REWARDED_AD_MAX_PER_HOUR - 1,
  );
});

test("claimRewardedAdCredit returns duplicate for repeated claimId", async () => {
  const originalFindById = User.findById;
  const originalFindOne = CreditLedger.findOne;
  const originalFind = CreditLedger.find;

  const createLeanChain = (value) => ({
    select() {
      return this;
    },
    sort() {
      return this;
    },
    lean: async () => value,
  });

  try {
    User.findById = () => createLeanChain({ _id: "u1", credits: 20 });
    CreditLedger.findOne = () => ({
      lean: async () => ({ _id: "existing-claim" }),
    });
    CreditLedger.find = () => createLeanChain([]);

    const result = await claimRewardedAdCredit({
      userId: "u1",
      claimId: "claim-abc",
      now: new Date("2026-03-01T12:00:00.000Z"),
    });

    assert.equal(result.granted, false);
    assert.equal(result.reason, "DUPLICATE_CLAIM");
    assert.equal(result.credits, 20);
  } finally {
    User.findById = originalFindById;
    CreditLedger.findOne = originalFindOne;
    CreditLedger.find = originalFind;
  }
});

