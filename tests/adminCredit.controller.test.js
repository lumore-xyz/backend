import assert from "node:assert/strict";
import test from "node:test";
import CreditLedger from "../models/creditLedger.model.js";
import MatchRoom from "../models/room.model.js";
import {
  getCreditLedgerAdmin,
  getCreditLedgerAnalyticsAdmin,
} from "../controllers/adminCredit.controller.js";

const createRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (body) => ((res.body = body), res);
  return res;
};

test("credit ledger endpoint delegates filtering and returns bounded pagination", async () => {
  const originalFind = CreditLedger.find;
  const originalCount = CreditLedger.countDocuments;
  let filter;
  let skip;
  CreditLedger.find = (query) => {
    filter = query;
    return {
      sort() { return this; },
      skip(value) { skip = value; return this; },
      limit() { return this; },
      populate() { return this; },
      lean: async () => [{ _id: "ledger-1" }],
    };
  };
  CreditLedger.countDocuments = async () => 21;

  try {
    const res = createRes();
    await getCreditLedgerAdmin(
      { query: { page: "2", limit: "10", userId: "user-1", type: "signup_bonus" } },
      res,
    );

    assert.deepEqual(filter, { user: "user-1", type: "signup_bonus" });
    assert.equal(skip, 10);
    assert.deepEqual(res.body.pagination, {
      page: 2,
      limit: 10,
      total: 21,
      hasMore: true,
    });
  } finally {
    CreditLedger.find = originalFind;
    CreditLedger.countDocuments = originalCount;
  }
});

test("credit analytics builds period buckets and aggregates its own series", async () => {
  const originalLedgerAggregate = CreditLedger.aggregate;
  const originalMatchAggregate = MatchRoom.aggregate;
  const ledgerPipelines = [];
  CreditLedger.aggregate = async (pipeline) => {
    ledgerPipelines.push(pipeline);
    const type = pipeline[0].$match.type;
    const bucket = pipeline[0].$match.createdAt.$gte.toISOString().slice(0, 10);
    return type === "daily_active"
      ? [{ _id: bucket, count: 2 }]
      : [{ _id: bucket, count: 3 }];
  };
  MatchRoom.aggregate = async (pipeline) => [{
    _id: pipeline[0].$match.createdAt.$gte.toISOString().slice(0, 10),
    count: 4,
  }];

  try {
    const res = createRes();
    await getCreditLedgerAnalyticsAdmin({ query: { limit: "1" } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.period, "daily");
    assert.equal(res.body.data.series.dailyActive[0].count, 2);
    assert.equal(res.body.data.series.signups[0].count, 3);
    assert.equal(res.body.data.series.conversations[0].count, 4);
    assert.equal(res.body.data.totals.conversations, 4);
    assert.equal(ledgerPipelines.length, 2);
  } finally {
    CreditLedger.aggregate = originalLedgerAggregate;
    MatchRoom.aggregate = originalMatchAggregate;
  }
});

test("credit analytics rejects unsupported periods", async () => {
  const res = createRes();
  await getCreditLedgerAnalyticsAdmin({ query: { period: "weekly" } }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /daily, monthly or yearly/);
});
