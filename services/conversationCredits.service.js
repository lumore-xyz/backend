import CreditLedger from "../models/creditLedger.model.js";
import User from "../models/user.model.js";
import { runInTransaction } from "../utils/transaction.js";
import { CREDIT_RULES } from "./creditRules.js";
import { CREDIT_LEDGER_TYPE } from "../utils/creditLedger.js";

const buildConversationLedgerEntry = ({
  initiatorId,
  partnerId,
  initiatorBalance,
}) => ({
  user: initiatorId,
  amount: -CREDIT_RULES.CONVERSATION_COST,
  type: CREDIT_LEDGER_TYPE.CONVERSATION_START,
  balanceAfter: initiatorBalance,
  referenceType: "user",
  referenceId: partnerId.toString(),
  meta: { partnerId: partnerId.toString() },
});

const getExistingConversationCharge = async ({
  initiatorId,
  partnerId,
  initiatorKey,
  session,
}) => {
  const ledgerQuery = CreditLedger.findOne({
    user: initiatorId,
    type: CREDIT_LEDGER_TYPE.CONVERSATION_START,
    referenceType: "user",
    referenceId: partnerId.toString(),
  });
  if (session) ledgerQuery.session(session);
  const ledger = await ledgerQuery.lean();
  if (!ledger) return null;

  const userQuery = User.findById(initiatorId).select("credits");
  if (session) userQuery.session(session);
  const user = await userQuery.lean();
  if (!user) return { success: false, reason: "USER_NOT_FOUND" };

  return {
    success: true,
    alreadyCharged: true,
    balances: { [initiatorKey]: user.credits },
    ledgerId: ledger._id,
  };
};

export const spendCreditsForConversationStart = async (initiatorId, partnerId) => {
  const initiatorKey = initiatorId.toString();
  const runWithoutTransaction = async () => {
    const existingCharge = await getExistingConversationCharge({
      initiatorId,
      partnerId,
      initiatorKey,
    });
    if (existingCharge) return existingCharge;

    let initiatorUser = null;
    let initiatorLedger = null;

    try {
      initiatorUser = await User.findOneAndUpdate(
        { _id: initiatorId, credits: { $gte: CREDIT_RULES.CONVERSATION_COST } },
        { $inc: { credits: -CREDIT_RULES.CONVERSATION_COST } },
        { returnDocument: "after" },
      );
      if (!initiatorUser) {
        return { success: false, reason: "INSUFFICIENT_CREDITS" };
      }

      initiatorLedger = await CreditLedger.create(buildConversationLedgerEntry({
        initiatorId,
        partnerId,
        initiatorBalance: initiatorUser.credits,
      }));

      return {
        success: true,
        balances: {
          [initiatorKey]: initiatorUser.credits,
        },
        ledgerId: initiatorLedger._id,
      };
    } catch (fallbackWriteError) {
      if (initiatorLedger?._id) {
        await CreditLedger.deleteOne({ _id: initiatorLedger._id });
      }
      if (initiatorUser?._id) {
        await User.findByIdAndUpdate(initiatorId, {
          $inc: { credits: CREDIT_RULES.CONVERSATION_COST },
        });
      }

      throw fallbackWriteError;
    }
  };

  try {
    const transactionResult = await runInTransaction(
      async (session) => {
        const existingCharge = await getExistingConversationCharge({
          initiatorId,
          partnerId,
          initiatorKey,
          session,
        });
        if (existingCharge) return existingCharge;

        const initiatorUser = await User.findOneAndUpdate(
          { _id: initiatorId, credits: { $gte: CREDIT_RULES.CONVERSATION_COST } },
          { $inc: { credits: -CREDIT_RULES.CONVERSATION_COST } },
          { returnDocument: "after", session },
        );

        if (!initiatorUser) {
          throw new Error("INSUFFICIENT_CREDITS");
        }

        const [ledger] = await CreditLedger.create(
          [buildConversationLedgerEntry({
            initiatorId,
            partnerId,
            initiatorBalance: initiatorUser.credits,
          })],
          { session, ordered: true },
        );

        return {
          success: true,
          balances: {
            [initiatorKey]: initiatorUser.credits,
          },
          ledgerId: ledger._id,
        };
      },
      {
        fallback: async () => {
          return runWithoutTransaction();
        },
      },
    );
    return transactionResult;
  } catch (error) {
    if (error.message === "INSUFFICIENT_CREDITS") {
      return { success: false, reason: "INSUFFICIENT_CREDITS" };
    }
    throw error;
  }
};

export const refundConversationStart = async ({ initiatorId, ledgerId }) => {
  const refund = async (session) => {
    const ledger = await CreditLedger.findOneAndDelete(
      {
        _id: ledgerId,
        user: initiatorId,
        type: CREDIT_LEDGER_TYPE.CONVERSATION_START,
      },
      { session },
    );
    if (!ledger) return false;

    const user = await User.findByIdAndUpdate(
      initiatorId,
      { $inc: { credits: CREDIT_RULES.CONVERSATION_COST } },
      { session, returnDocument: "after" },
    );
    if (!user) throw new Error("CONVERSATION_REFUND_USER_NOT_FOUND");
    return true;
  };

  return runInTransaction(refund, {
    fallback: async () => {
      const ledger = await CreditLedger.findOneAndDelete({
        _id: ledgerId,
        user: initiatorId,
        type: CREDIT_LEDGER_TYPE.CONVERSATION_START,
      });
      if (!ledger) return false;

      try {
        const user = await User.findByIdAndUpdate(initiatorId, {
          $inc: { credits: CREDIT_RULES.CONVERSATION_COST },
        });
        if (!user) throw new Error("CONVERSATION_REFUND_USER_NOT_FOUND");
        return true;
      } catch (error) {
        await CreditLedger.create(ledger.toObject());
        throw error;
      }
    },
  });
};

