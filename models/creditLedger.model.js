import mongoose from "mongoose";

const creditLedgerSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        "signup_bonus",
        "daily_active",
        "conversation_start",
        "this_or_that_approved",
        "referral_bonus",
        "rewarded_ad_watch",
        "admin_adjustment",
      ],
      index: true,
    },
    referenceType: {
      type: String,
      default: null,
      index: true,
    },
    referenceId: {
      type: String,
      default: null,
      index: true,
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
creditLedgerSchema.index(
  { user: 1, type: 1, referenceType: 1, referenceId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: "rewarded_ad_watch",
      referenceType: "rewarded_ad_session",
    },
  },
);

export default mongoose.model("CreditLedger", creditLedgerSchema);
