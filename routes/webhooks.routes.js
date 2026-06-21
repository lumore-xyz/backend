// backend/routes/webhooks.js
import crypto from "crypto";
import express from "express";
import User from "../models/user.model.js";
import { awardReferralBonusForVerifiedUser } from "../services/credits.service.js";
import {
  notifyVerificationStatusChange,
} from "../services/notification.service.js";

const router = express.Router();

// Keep raw payload for signature validation
router.use("/didit/callback", express.raw({ type: "*/*" }));

const safeEqual = (a, b) => {
  const aBuf = Buffer.from(String(a || ""));
  const bBuf = Buffer.from(String(b || ""));
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
};

const mapVerificationStatus = (eventType, rawStatus) => {
  const normalizedStatus = String(rawStatus || "").toLowerCase();
  const normalizedEvent = String(eventType || "").toLowerCase();

  if (
    ["in review", "in_review", "review", "pending"].includes(normalizedStatus)
  ) {
    return { isVerified: false, verificationStatus: "pending" };
  }

  if (
    ["approved", "verified", "completed", "success"].includes(normalizedStatus)
  ) {
    return { isVerified: true, verificationStatus: "approved" };
  }

  if (
    ["rejected", "declined", "failed", "error", "expired"].includes(
      normalizedStatus,
    )
  ) {
    return { isVerified: false, verificationStatus: "failed" };
  }

  if (
    normalizedEvent.includes("session.completed") ||
    normalizedEvent.includes("session.approved")
  ) {
    return { isVerified: true, verificationStatus: "approved" };
  }

  if (
    normalizedEvent.includes("session.rejected") ||
    normalizedEvent.includes("session.failed")
  ) {
    return { isVerified: false, verificationStatus: "failed" };
  }

  return { isVerified: false, verificationStatus: "pending" };
};

const frontendBaseUrl = () =>
  (process.env.FRONTEND_URL || "https://lumore.xyz").replace(/\/+$/, "");

// Browser callback from Didit. Update state using query params and redirect user.
router.get("/didit/callback", async (req, res) => {
  try {
    const verificationSessionId = req.query?.verificationSessionId;
    const status = req.query?.status;

    if (verificationSessionId) {
      const statusPatch = mapVerificationStatus("", status);
      const previousUser = await User.findOne({
        verificationSessionId: String(verificationSessionId),
      })
        .select("verificationStatus isVerified")
        .lean();
      const updatedUser = await User.findOneAndUpdate(
        { verificationSessionId: String(verificationSessionId) },
        {
          verificationMethod: "didit",
          ...statusPatch,
        },
        { returnDocument: "after" }
      );

      if (updatedUser?.isVerified || updatedUser?.verificationStatus === "approved") {
        await awardReferralBonusForVerifiedUser({
          referredUserId: updatedUser._id,
          now: new Date(),
        });
      }

      await notifyVerificationStatusChange({
        userId: updatedUser?._id,
        status: updatedUser?.verificationStatus,
        previousStatus: previousUser?.verificationStatus,
        source: "didit_browser_callback",
        metadata: { sessionId: String(verificationSessionId) },
      });
    }

    return res.redirect(302, `${frontendBaseUrl()}/app/profile`);
  } catch (error) {
    console.error("Didit browser callback error:", error);
    return res.redirect(302, `${frontendBaseUrl()}/app/profile`);
  }
});

router.post("/didit/callback", async (req, res) => {
  const signature = req.headers["x-signature"];
  const body = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(JSON.stringify(req.body || {}));

  if (process.env.DIDIT_WEBHOOK_KEY && signature) {
    const hmacHex = crypto
      .createHmac("sha256", process.env.DIDIT_WEBHOOK_KEY)
      .update(body)
      .digest("hex");
    const hmacWithPrefix = `sha256=${hmacHex}`;
    const isValid =
      safeEqual(signature, hmacHex) || safeEqual(signature, hmacWithPrefix);

    if (!isValid) {
      return res.status(401).json({ message: "Invalid webhook signature" });
    }
  }

  try {
    const event = JSON.parse(body.toString());
    const eventType = event?.event || event?.type || "";
    const session = event?.data?.session || event?.session || event?.data || {};
    const userId = session?.vendor_data || event?.vendor_data;
    const sessionId = session?.session_id || session?.id || null;
    const rawStatus = session?.status || event?.status;

    if (userId) {
      const statusPatch = mapVerificationStatus(eventType, rawStatus);

      const previousUser = await User.findById(userId)
        .select("verificationStatus isVerified")
        .lean();
      const updatedUser = await User.findByIdAndUpdate(userId, {
        verificationMethod: "didit",
        verificationSessionId: sessionId,
        ...statusPatch,
      }, { returnDocument: "after" });

      if (updatedUser?.isVerified || updatedUser?.verificationStatus === "approved") {
        await awardReferralBonusForVerifiedUser({
          referredUserId: updatedUser._id,
          now: new Date(),
        });
      }

      await notifyVerificationStatusChange({
        userId: updatedUser?._id,
        status: updatedUser?.verificationStatus,
        previousStatus: previousUser?.verificationStatus,
        source: "didit_webhook",
        metadata: { sessionId, eventType },
      });
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error("Didit webhook parse/update error:", error);
    return res.status(400).json({ message: "Invalid webhook payload" });
  }
});

export default router;

