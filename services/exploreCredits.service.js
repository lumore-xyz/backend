import CreditLedger from "../models/creditLedger.model.js";
import ExploreDaily from "../models/exploreDaily.model.js";
import User from "../models/user.model.js";
import { CREDIT_RULES } from "./creditRules.js";
import { CREDIT_LEDGER_TYPE } from "../utils/creditLedger.js";
import { EXPLORE_DAILY_STATUS } from "../utils/exploreDaily.js";

const paymentError = (message, statusCode = 409, code) =>
  Object.assign(new Error(message), { statusCode, ...(code && { code }) });

const upsertLedgerEntry = async (query, update) => {
  try {
    await CreditLedger.updateOne(query, update, { upsert: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
    await CreditLedger.updateOne(query, update, { upsert: true });
  }
};

const debitExplorePayment = async ({
  userId,
  dayKey,
  referenceId,
  kind,
}) => {
  const isRefresh = kind === "refresh";
  const paymentField = isRefresh ? "exploreRefreshPayment" : "explorePayment";
  const cost = isRefresh
    ? CREDIT_RULES.EXPLORE_FORCE_REFRESH_COST
    : CREDIT_RULES.EXPLORE_DAILY_COST;
  const select = `credits +${paymentField}`;
  const existing = await User.findById(userId).select(select).lean();
  if (!existing) throw paymentError("User not found", 404);
  if (existing[paymentField]?.referenceId === referenceId) {
    return existing[paymentField];
  }

  const reusablePayment = isRefresh
    ? { [`${paymentField}.settled`]: true }
    : { [`${paymentField}.settled`]: true, [`${paymentField}.dayKey`]: { $lt: dayKey } };
  const user = await User.findOneAndUpdate(
    {
      _id: userId,
      isArchived: { $ne: true },
      credits: { $gte: cost },
      $or: [{ [paymentField]: null }, reusablePayment],
    },
    [{ $set: {
      credits: { $subtract: ["$credits", cost] },
      [paymentField]: {
        dayKey,
        referenceId,
        balanceAfter: { $subtract: ["$credits", cost] },
        settled: false,
      },
    } }],
    { returnDocument: "after", updatePipeline: true },
  ).select(select).lean();
  if (user) return user[paymentField];

  const current = await User.findById(userId).select(select).lean();
  if (current?.[paymentField]?.referenceId === referenceId) {
    return current[paymentField];
  }
  if (isRefresh && current?.[paymentField] && !current[paymentField].settled) {
    throw paymentError("Another Explore refresh payment is pending; retry", 409, "EXPLORE_PAYMENT_PENDING");
  }
  if (current && current.credits < cost) {
    throw paymentError("Insufficient credits", 409, "INSUFFICIENT_CREDITS");
  }
  throw paymentError(
    isRefresh
      ? "Explore refresh payment is pending; retry"
      : "Explore payment is pending or this day has expired; retry",
    409,
    "EXPLORE_PAYMENT_PENDING",
  );
};

export const debitExploreUnlock = (args) =>
  debitExplorePayment({ ...args, kind: "unlock" });

export const debitExploreRefresh = (args) =>
  debitExplorePayment({ ...args, kind: "refresh" });

export const settleExplorePayment = async (userId) => {
  const user = await User.findById(userId).select("+explorePayment").lean();
  const receipt = user?.explorePayment;
  if (!receipt || receipt.settled) return;

  const daily = await ExploreDaily.findOne({ user: userId, dayKey: receipt.dayKey }).lean();
  if (
    !daily ||
    ![
      EXPLORE_DAILY_STATUS.PREPARED,
      EXPLORE_DAILY_STATUS.READY,
    ].includes(daily.status)
  ) {
    throw paymentError("Explore payment recovery is pending; retry", 503, "EXPLORE_PAYMENT_PENDING");
  }
  const ledgerQuery = {
    user: userId,
    type: CREDIT_LEDGER_TYPE.EXPLORE_UNLOCK,
    referenceId: receipt.referenceId,
  };
  const ledgerUpdate = { $setOnInsert: {
    ...ledgerQuery,
    referenceType: "explore_daily",
    amount: -CREDIT_RULES.EXPLORE_DAILY_COST,
    balanceAfter: receipt.balanceAfter,
    meta: { dayKey: receipt.dayKey, dailyId: String(daily._id) },
  } };
  await upsertLedgerEntry(ledgerQuery, ledgerUpdate);
  const saved = await ExploreDaily.updateOne(
    {
      _id: daily._id,
      status: {
        $in: [EXPLORE_DAILY_STATUS.PREPARED, EXPLORE_DAILY_STATUS.READY],
      },
    },
    { $set: {
      status: EXPLORE_DAILY_STATUS.READY,
      amountPaid: CREDIT_RULES.EXPLORE_DAILY_COST,
      balanceAfter: receipt.balanceAfter,
    } },
  );
  if (!saved.matchedCount) throw paymentError("Explore list is unavailable", 503);
  await User.updateOne(
    { _id: userId, "explorePayment.referenceId": receipt.referenceId },
    { $set: { "explorePayment.settled": true } },
  );
};

export const settleExploreRefreshPayment = async (userId) => {
  const user = await User.findById(userId).select("+exploreRefreshPayment").lean();
  const receipt = user?.exploreRefreshPayment;
  if (!receipt || receipt.settled) return;

  const daily = await ExploreDaily.findOne({
    user: userId,
    dayKey: receipt.dayKey,
    "pendingRefresh.referenceId": receipt.referenceId,
  }).lean();
  if (!daily && !(await ExploreDaily.exists({
    user: userId,
    dayKey: receipt.dayKey,
    lastRefreshReferenceId: receipt.referenceId,
  }))) {
    throw paymentError(
      "Explore refresh recovery is pending; retry",
      503,
      "EXPLORE_PAYMENT_PENDING",
    );
  }

  const ledgerQuery = {
    user: userId,
    type: CREDIT_LEDGER_TYPE.EXPLORE_REFRESH,
    referenceType: CREDIT_LEDGER_TYPE.EXPLORE_REFRESH,
    referenceId: receipt.referenceId,
  };
  const ledgerUpdate = { $setOnInsert: {
    ...ledgerQuery,
    amount: -CREDIT_RULES.EXPLORE_FORCE_REFRESH_COST,
    balanceAfter: receipt.balanceAfter,
    meta: { dayKey: receipt.dayKey },
  } };
  await upsertLedgerEntry(ledgerQuery, ledgerUpdate);
  if (daily) {
    await ExploreDaily.updateOne(
      { _id: daily._id, "pendingRefresh.referenceId": receipt.referenceId },
      {
        $set: {
          profiles: daily.pendingRefresh.profiles,
          candidateCount: daily.pendingRefresh.candidateCount,
          lastRefreshReferenceId: receipt.referenceId,
        },
        $unset: { pendingRefresh: 1 },
      },
    );
  }
  await User.updateOne(
    { _id: userId, "exploreRefreshPayment.referenceId": receipt.referenceId },
    { $set: { "exploreRefreshPayment.settled": true } },
  );
};
