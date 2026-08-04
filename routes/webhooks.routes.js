import express from "express";
import User from "../models/user.model.js";
import { awardReferralBonusForVerifiedUser } from "../services/credits.service.js";
import { notifyVerificationStatusChange } from "../services/notification.service.js";

const router = express.Router();

router.use("/webhooks/halokyc", express.raw({ type: "application/json" }));

router.post("/webhooks/halokyc", async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(req.body || "");

  try {
    const event = JSON.parse(rawBody.toString());
    const statusMap = {
      pending_upload: { isVerified: false, verificationStatus: "pending" },
      awaiting_credits: { isVerified: false, verificationStatus: "pending" },
      processing: { isVerified: false, verificationStatus: "pending" },
      manual_review: { isVerified: false, verificationStatus: "pending" },
      approved: { isVerified: true, verificationStatus: "approved" },
      rejected: { isVerified: false, verificationStatus: "rejected" },
    };
    const statusPatch = statusMap[event?.status];

    if (!statusPatch || !event?.external_user_id || !event?.verification_id) {
      return res.sendStatus(204);
    }

    const userFilter = {
      _id: event.external_user_id,
      verificationSessionId: event.verification_id,
    };
    const previousUser = await User.findOne(userFilter)
      .select("verificationStatus isVerified")
      .lean();

    if (!previousUser) {
      return res.sendStatus(204);
    }

    const updatedUser = await User.findOneAndUpdate(
      userFilter,
      { verificationMethod: "halokyc", ...statusPatch },
      { returnDocument: "after" },
    );

    if (!updatedUser) {
      return res.sendStatus(204);
    }

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

    return res.sendStatus(204);
  } catch (error) {
    console.error("HaloKYC webhook error:", error);
    return res.status(400).json({ message: "Invalid webhook payload" });
  }
});

export default router;
