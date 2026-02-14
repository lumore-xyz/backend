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

export default mongoose.model("CreditLedger", creditLedgerSchema);

