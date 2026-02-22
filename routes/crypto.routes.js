import express from "express";
import {
  getRecoveryStatus,
  getIdentityKey,
  getRecoveryBackup,
  getRoomEnvelopes,
  recoverWithPin,
  setupRecoveryPin,
  upsertIdentityKey,
  upsertRecoveryBackup,
  upsertRoomEnvelopes,
} from "../controllers/crypto.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { recoveryPinVerifyLimiter } from "../middleware/rateLimit.middleware.js";
import { validateObjectIdParam } from "../middleware/validate.middleware.js";

const router = express.Router();

router.post("/identity-key", protect, upsertIdentityKey);
router.get(
  "/identity-key/:userId",
  protect,
  validateObjectIdParam("userId"),
  getIdentityKey
);
router.post("/recovery-backup", protect, upsertRecoveryBackup);
router.get("/recovery-backup", protect, getRecoveryBackup);
router.get("/recovery-status", protect, getRecoveryStatus);
router.post("/recovery-pin/setup", protect, setupRecoveryPin);
router.post("/recovery-pin/recover", protect, recoveryPinVerifyLimiter, recoverWithPin);
router.post(
  "/room/:roomId/envelopes",
  protect,
  validateObjectIdParam("roomId"),
  upsertRoomEnvelopes
);
router.get(
  "/room/:roomId/envelopes",
  protect,
  validateObjectIdParam("roomId"),
  getRoomEnvelopes
);

export default router;
