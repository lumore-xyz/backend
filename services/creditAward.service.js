import CreditLedger from "../models/creditLedger.model.js";
import User from "../models/user.model.js";
import { runInTransaction } from "../utils/transaction.js";

export const awardCredits = async ({
  userId,
  amount,
  type,
  referenceType,
  referenceId,
  meta = {},
}) => {
  const ledgerEntry = { user: userId, amount, type, referenceType, referenceId, meta };
  const ledgerKey = { user: userId, type, referenceType, referenceId };

  const awardWithoutTransaction = async () => {
    if (await CreditLedger.exists(ledgerKey)) {
      return { granted: false, reason: "ALREADY_GRANTED" };
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $inc: { credits: amount } },
      { returnDocument: "after" },
    );
    if (!user) return { granted: false, reason: "USER_NOT_FOUND" };

    try {
      await CreditLedger.create({ ...ledgerEntry, balanceAfter: user.credits });
    } catch (error) {
      await User.updateOne({ _id: userId }, { $inc: { credits: -amount } });
      throw error;
    }
    return { granted: true, credits: user.credits };
  };

  return runInTransaction(
    async (session) => {
      if (await CreditLedger.exists(ledgerKey).session(session)) {
        return { granted: false, reason: "ALREADY_GRANTED" };
      }

      const user = await User.findByIdAndUpdate(
        userId,
        { $inc: { credits: amount } },
        { returnDocument: "after", session },
      );
      if (!user) return { granted: false, reason: "USER_NOT_FOUND" };

      await CreditLedger.create(
        [{ ...ledgerEntry, balanceAfter: user.credits }],
        { session, ordered: true },
      );
      return { granted: true, credits: user.credits };
    },
    { fallback: awardWithoutTransaction },
  );
};
