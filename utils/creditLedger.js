export const CREDIT_LEDGER_TYPE = Object.freeze({
  SIGNUP_BONUS: "signup_bonus",
  DAILY_ACTIVE: "daily_active",
  CONVERSATION_START: "conversation_start",
  THIS_OR_THAT_APPROVED: "this_or_that_approved",
  REFERRAL_BONUS: "referral_bonus",
  REWARDED_AD_WATCH: "rewarded_ad_watch",
  EXPLORE_UNLOCK: "explore_unlock",
  EXPLORE_REFRESH: "explore_refresh",
  ADMIN_ADJUSTMENT: "admin_adjustment",
});

export const CREDIT_LEDGER_TYPES = Object.freeze(
  Object.values(CREDIT_LEDGER_TYPE),
);
