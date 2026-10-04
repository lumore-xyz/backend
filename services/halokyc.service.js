import axios from "axios";
import User from "../models/user.model.js";
import { normalizeString } from "../utils/strings.js";
import { getUtcDateKey } from "../utils/utcDate.js";
import { isVerifiedUser, VERIFICATION_STATUS } from "../utils/verification.js";
import { awardReferralBonusForVerifiedUser } from "./referralCredits.service.js";
import { notifyVerificationStatusChange } from "./notificationPublisher.service.js";

const VERIFICATION_STATUS_PATCHES = {
  pending_upload: {
    isVerified: false,
    verificationStatus: VERIFICATION_STATUS.PENDING,
  },
  awaiting_credits: {
    isVerified: false,
    verificationStatus: VERIFICATION_STATUS.PENDING,
  },
  processing: {
    isVerified: false,
    verificationStatus: VERIFICATION_STATUS.PENDING,
  },
  manual_review: {
    isVerified: false,
    verificationStatus: VERIFICATION_STATUS.PENDING,
  },
  approved: {
    isVerified: true,
    verificationStatus: VERIFICATION_STATUS.APPROVED,
  },
  rejected: {
    isVerified: false,
    verificationStatus: VERIFICATION_STATUS.REJECTED,
  },
};

const normalizeDateOfBirth = (dateOfBirth) => {
  if (!dateOfBirth) return undefined;
  const date = new Date(dateOfBirth);
  return Number.isNaN(date.getTime())
    ? undefined
    : getUtcDateKey(date);
};

export const createVerificationSession = async (userId) => {
  const user = await User.findById(userId).select(
    "realName dob gender isVerified verificationStatus",
  );
  if (!user) return null;
  if (isVerifiedUser(user)) {
    return { alreadyVerified: true };
  }

  const gender = typeof user.gender === "string"
    ? normalizeString(user.gender)
    : undefined;
  const { data } = await axios.post(
    `${process.env.HALOKYC_API_URL}/api/v1/verifications/start`,
    {
      external_user_id: String(user._id),
      workflow_id: process.env.HALOKYC_WORKFLOW_ID,
      metadata: {
        name: user.realName,
        dob: normalizeDateOfBirth(user.dob),
        gender,
      },
      completion_url: "https://api.lumore.xyz/api/halokyc/complete",
    },
    {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.HALOKYC_API_KEY,
      },
    },
  );

  if (!data?.verification_id) {
    throw new Error("HaloKYC response did not include verification_id");
  }

  const verificationUrl = new URL("/verify", process.env.HALOKYC_APP_URL);
  verificationUrl.searchParams.set("verification_id", data.verification_id);
  await User.findByIdAndUpdate(userId, {
    verificationMethod: "halokyc",
    verificationStatus: VERIFICATION_STATUS.PENDING,
    verificationSessionId: data.verification_id,
  });

  return {
    verificationUrl: verificationUrl.toString(),
    sessionId: data.verification_id,
  };
};

export const processHaloKycWebhook = async (body) => {
  const rawBody = Buffer.isBuffer(body) ? body : Buffer.from(body || "");
  const event = JSON.parse(rawBody.toString());
  const statusPatch = VERIFICATION_STATUS_PATCHES[event?.status];
  if (!statusPatch || !event?.external_user_id || !event?.verification_id) return;

  const userFilter = {
    _id: event.external_user_id,
    verificationSessionId: event.verification_id,
  };
  const previousUser = await User.findOne(userFilter)
    .select("verificationStatus isVerified")
    .lean();
  if (!previousUser) return;

  const updatedUser = await User.findOneAndUpdate(
    { ...userFilter, verificationStatus: previousUser.verificationStatus },
    { verificationMethod: "halokyc", ...statusPatch },
    { returnDocument: "after" },
  );
  if (!updatedUser) return;

  if (event.status === "approved") {
    await awardReferralBonusForVerifiedUser({
      referredUserId: updatedUser._id,
      now: new Date(),
    });
  }

  await notifyVerificationStatusChange({
    userId: updatedUser._id,
    status: updatedUser.verificationStatus,
    previousStatus: previousUser.verificationStatus,
    source: "halokyc_webhook",
    metadata: {
      verificationId: event.verification_id,
      riskScore: event.risk_score,
      decisionReason: event.decision_reason,
    },
  });
};
