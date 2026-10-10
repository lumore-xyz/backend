export const VERIFICATION_STATUS = Object.freeze({
  NOT_STARTED: "not_started",
  PENDING: "pending",
  PROCESSING: "processing",
  APPROVED: "approved",
  REJECTED: "rejected",
  FAILED: "failed",
});

export const VERIFICATION_STATUSES = Object.freeze(
  Object.values(VERIFICATION_STATUS),
);

export const isVerifiedUser = (user) =>
  Boolean(
    user?.isVerified ||
      user?.verificationStatus === VERIFICATION_STATUS.APPROVED,
  );
