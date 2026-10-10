import {
  createVerificationSession,
  processHaloKycWebhook,
} from "../services/halokyc.service.js";
import { logError } from "../utils/logError.js";
import { VERIFICATION_STATUS } from "../utils/verification.js";

export const completeHaloKyc = (_req, res) =>
  res.redirect(302, "lumore://profile");

export const createHaloKycVerification = async (req, res) => {
  try {
    const result = await createVerificationSession(req.user?.id);
    if (!result) return res.status(404).json({ error: "User not found" });
    if (result.alreadyVerified) {
      return res.json({
        message: "User already verified",
        isVerified: true,
        verificationStatus: VERIFICATION_STATUS.APPROVED,
      });
    }
    if (result.verificationStatus) {
      return res.json({
        message: "Verification status updated",
        isVerified: result.verificationStatus === VERIFICATION_STATUS.APPROVED,
        verificationStatus: result.verificationStatus,
      });
    }
    return res.json(result);
  } catch (error) {
    logError("HaloKYC create session failed", error);
    return res.status(502).json({ error: "Verification could not be created" });
  }
};

export const receiveHaloKycWebhook = async (req, res) => {
  try {
    await processHaloKycWebhook(req.body);
    return res.sendStatus(204);
  } catch (error) {
    logError("HaloKYC webhook failed", error);
    return res.status(400).json({ message: "Invalid webhook payload" });
  }
};
