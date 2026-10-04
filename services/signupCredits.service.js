import CreditLedger from "../models/creditLedger.model.js";
import User from "../models/user.model.js";
import { CREDIT_LEDGER_TYPE } from "../utils/creditLedger.js";
import { CREDIT_RULES } from "./creditRules.js";

export const grantSignupBonusIfMissing = async (userId) => {
  const existing = await CreditLedger.findOne({
    user: userId,
    type: CREDIT_LEDGER_TYPE.SIGNUP_BONUS,
  }).lean();
  if (existing) return { granted: false };

  const user = await User.findById(userId).select("credits").lean();
  if (!user) return { granted: false };

  await CreditLedger.create({
    user: userId,
    amount: CREDIT_RULES.SIGNUP_BONUS,
    type: CREDIT_LEDGER_TYPE.SIGNUP_BONUS,
    balanceAfter: user.credits,
    referenceType: "user",
    referenceId: userId.toString(),
  });
  return { granted: true, credits: user.credits };
};
