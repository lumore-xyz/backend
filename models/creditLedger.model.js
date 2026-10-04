import mongoose from "mongoose";
import { CREDIT_LEDGER_TYPE, CREDIT_LEDGER_TYPES } from "../utils/creditLedger.js";

const creditLedgerSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: CREDIT_LEDGER_TYPES,
    },
    referenceType: {
      type: String,
      default: null,
    },
    referenceId: {
      type: String,
      default: null,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
    meta: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true }
);

creditLedgerSchema.index({ user: 1, createdAt: -1 });
creditLedgerSchema.index({ user: 1, type: 1, createdAt: -1 });
creditLedgerSchema.index({ type: 1, createdAt: -1 });
creditLedgerSchema.index(
  { user: 1, type: 1, referenceType: 1, referenceId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: CREDIT_LEDGER_TYPE.REWARDED_AD_WATCH,
      referenceType: "rewarded_ad_session",
    },
  },
);

creditLedgerSchema.index(
  { user: 1, referenceId: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { type: CREDIT_LEDGER_TYPE.EXPLORE_UNLOCK },
  },
);

creditLedgerSchema.index(
  { user: 1, referenceId: 1, type: 1 },
  {
    name: "creditLedger_explore_refresh_unique",
    unique: true,
    partialFilterExpression: { type: CREDIT_LEDGER_TYPE.EXPLORE_REFRESH },
  },
);

export default mongoose.model("CreditLedger", creditLedgerSchema);
