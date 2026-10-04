import { CREDIT_RULES } from "./creditRules.js";
import { CREDIT_LEDGER_TYPE } from "../utils/creditLedger.js";
import { awardCredits } from "./creditAward.service.js";
export const awardCreditsForThisOrThatApproval = async ({
  userId,
  questionId,
  now = new Date(),
}) => {
  return awardCredits({
    userId,
    amount: CREDIT_RULES.THIS_OR_THAT_APPROVAL_BONUS,
    type: CREDIT_LEDGER_TYPE.THIS_OR_THAT_APPROVED,
    referenceType: "this_or_that_question",
    referenceId: questionId.toString(),
    meta: { awardedAt: now.toISOString() },
  });
};

