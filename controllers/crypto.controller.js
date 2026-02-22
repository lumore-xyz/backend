import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import RoomKeyEnvelope from "../models/roomKeyEnvelope.model.js";
import MatchRoom from "../models/room.model.js";
import UserKeyBackup from "../models/userKeyBackup.model.js";
import UserKey from "../models/userKey.model.js";

const PIN_REGEX = /^\d{6}$/;
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCK_MINUTES = 15;

const normalizeEpoch = (value, fallback = 1) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
};

const isRoomParticipant = (room, userId) =>
  room?.participants?.some((id) => id.toString() === userId.toString());

export const upsertIdentityKey = async (req, res) => {
  try {
    const userId = req.user._id;
    const { identityPublicKey, algorithm = "X25519" } = req.body || {};

    if (!identityPublicKey || typeof identityPublicKey !== "string") {
      return res.status(400).json({ message: "identityPublicKey is required" });
    }

    const saved = await UserKey.findOneAndUpdate(
      { userId },
      {
        identityPublicKey: identityPublicKey.trim(),
        algorithm: String(algorithm || "X25519"),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return res.status(200).json(saved);
  } catch (error) {
    console.error("[crypto] upsertIdentityKey failed:", error);
    return res.status(500).json({ message: "Failed to save identity key" });
  }
};

export const getIdentityKey = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid userId" });
    }

    const keyDoc = await UserKey.findOne({ userId }).lean();
    if (!keyDoc) {
      return res.status(404).json({ message: "Identity key not found" });
    }

    return res.status(200).json({
      userId: keyDoc.userId,
      identityPublicKey: keyDoc.identityPublicKey,
      algorithm: keyDoc.algorithm,
      updatedAt: keyDoc.updatedAt,
    });
  } catch (error) {
    console.error("[crypto] getIdentityKey failed:", error);
    return res.status(500).json({ message: "Failed to fetch identity key" });
  }
};

export const upsertRecoveryBackup = async (req, res) => {
  try {
    const userId = req.user._id;
    const { encryptedPrivateKey, salt, kdfParams, nonce, version = 1 } =
      req.body || {};

    if (!encryptedPrivateKey || !salt || !kdfParams || !nonce) {
      return res.status(400).json({
        message: "encryptedPrivateKey, salt, kdfParams and nonce are required",
      });
    }

    const saved = await UserKeyBackup.findOneAndUpdate(
      { userId },
      {
        encryptedPrivateKey,
        salt,
        kdfParams,
        nonce,
        version: Number(version) || 1,
        recoveryMethod: "passphrase",
        recoveryEnabled: true,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return res.status(200).json({
      userId: saved.userId,
      version: saved.version,
      updatedAt: saved.updatedAt,
    });
  } catch (error) {
    console.error("[crypto] upsertRecoveryBackup failed:", error);
    return res.status(500).json({ message: "Failed to store recovery backup" });
  }
};

export const getRecoveryBackup = async (req, res) => {
  try {
    const userId = req.user._id;
    const backup = await UserKeyBackup.findOne({ userId }).lean();
    if (!backup) {
      return res.status(404).json({ message: "Recovery backup not found" });
    }

    return res.status(200).json({
      encryptedPrivateKey: backup.encryptedPrivateKey,
      publicKeySpki: backup.publicKeySpki || null,
      salt: backup.salt,
      kdfParams: backup.kdfParams,
      nonce: backup.nonce,
      version: backup.version,
      updatedAt: backup.updatedAt,
    });
  } catch (error) {
    console.error("[crypto] getRecoveryBackup failed:", error);
    return res.status(500).json({ message: "Failed to fetch recovery backup" });
  }
};

export const getRecoveryStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const backup = await UserKeyBackup.findOne({ userId })
      .select("recoveryEnabled recoveryMethod pinFailedAttempts pinLockedUntil")
      .lean();

    if (!backup) {
      return res.status(200).json({
        recoveryEnabled: false,
        recoveryMethod: null,
        needsPinUpgrade: false,
        pinLockedUntil: null,
        remainingAttempts: MAX_PIN_ATTEMPTS,
      });
    }

    const recoveryMethod = backup.recoveryMethod || "passphrase";
    return res.status(200).json({
      recoveryEnabled: Boolean(backup.recoveryEnabled),
      recoveryMethod,
      needsPinUpgrade: recoveryMethod === "passphrase",
      pinLockedUntil: backup.pinLockedUntil || null,
      remainingAttempts:
        recoveryMethod === "pin"
          ? Math.max(MAX_PIN_ATTEMPTS - Number(backup.pinFailedAttempts || 0), 0)
          : MAX_PIN_ATTEMPTS,
    });
  } catch (error) {
    console.error("[crypto] getRecoveryStatus failed:", error);
    return res.status(500).json({ message: "Failed to fetch recovery status" });
  }
};

export const setupRecoveryPin = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      pin,
      encryptedPrivateKey,
      publicKeySpki,
      salt,
      kdfParams,
      nonce,
      version = 1,
    } = req.body || {};

    if (!PIN_REGEX.test(String(pin || ""))) {
      return res.status(400).json({ message: "PIN must be 6 digits" });
    }
    if (!encryptedPrivateKey || !salt || !kdfParams || !nonce) {
      return res.status(400).json({
        message:
          "encryptedPrivateKey, salt, kdfParams and nonce are required",
      });
    }

    const existing = await UserKeyBackup.findOne({ userId })
      .select("recoveryMethod")
      .lean();
    const pinHash = await bcrypt.hash(String(pin), 12);

    const saved = await UserKeyBackup.findOneAndUpdate(
      { userId },
      {
        encryptedPrivateKey,
        publicKeySpki: publicKeySpki || null,
        salt,
        kdfParams,
        nonce,
        version: Number(version) || 1,
        recoveryMethod: "pin",
        recoveryEnabled: true,
        pinHash,
        pinFailedAttempts: 0,
        pinLockedUntil: null,
        pinLastFailedAt: null,
        upgradedFromPassphrase: existing?.recoveryMethod === "passphrase",
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return res.status(200).json({
      userId: saved.userId,
      recoveryEnabled: true,
      recoveryMethod: saved.recoveryMethod,
      updatedAt: saved.updatedAt,
    });
  } catch (error) {
    console.error("[crypto] setupRecoveryPin failed:", error);
    return res.status(500).json({ message: "Failed to setup recovery PIN" });
  }
};

export const recoverWithPin = async (req, res) => {
  try {
    const userId = req.user._id;
    const { pin } = req.body || {};

    if (!PIN_REGEX.test(String(pin || ""))) {
      return res.status(400).json({ message: "Invalid recovery credentials" });
    }

    const backup = await UserKeyBackup.findOne({ userId }).select("+pinHash");
    if (!backup || backup.recoveryMethod !== "pin" || !backup.pinHash) {
      return res.status(401).json({ message: "Invalid recovery credentials" });
    }

    const now = new Date();
    if (backup.pinLockedUntil && backup.pinLockedUntil > now) {
      return res.status(423).json({
        message: "Too many tries. Try again later.",
        pinLockedUntil: backup.pinLockedUntil,
        remainingAttempts: 0,
      });
    }

    const isMatch = await bcrypt.compare(String(pin), backup.pinHash);
    if (!isMatch) {
      const failedAttempts = Number(backup.pinFailedAttempts || 0) + 1;
      const shouldLock = failedAttempts >= MAX_PIN_ATTEMPTS;
      const lockedUntil = shouldLock
        ? new Date(now.getTime() + PIN_LOCK_MINUTES * 60 * 1000)
        : null;

      backup.pinFailedAttempts = shouldLock ? 0 : failedAttempts;
      backup.pinLockedUntil = lockedUntil;
      backup.pinLastFailedAt = now;
      await backup.save();

      return res.status(401).json({
        message: "Invalid recovery credentials",
        pinLockedUntil: lockedUntil,
        remainingAttempts: shouldLock
          ? 0
          : Math.max(MAX_PIN_ATTEMPTS - failedAttempts, 0),
      });
    }

    backup.pinFailedAttempts = 0;
    backup.pinLockedUntil = null;
    backup.pinLastFailedAt = null;
    await backup.save();

    return res.status(200).json({
      encryptedPrivateKey: backup.encryptedPrivateKey,
      publicKeySpki: backup.publicKeySpki || null,
      salt: backup.salt,
      kdfParams: backup.kdfParams,
      nonce: backup.nonce,
      version: backup.version,
      recoveryMethod: backup.recoveryMethod,
    });
  } catch (error) {
    console.error("[crypto] recoverWithPin failed:", error);
    return res.status(500).json({ message: "Failed to recover chat keys" });
  }
};

export const upsertRoomEnvelopes = async (req, res) => {
  try {
    const callerId = req.user._id;
    const { roomId } = req.params;
    const { epoch, envelopes } = req.body || {};

    if (!roomId || !mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ message: "Invalid roomId" });
    }

    if (!Array.isArray(envelopes) || envelopes.length === 0) {
      return res.status(400).json({ message: "envelopes array is required" });
    }

    const room = await MatchRoom.findById(roomId).lean();
    if (!room || !isRoomParticipant(room, callerId)) {
      return res.status(403).json({ message: "Not authorized for this room" });
    }

    const normalizedEpoch = normalizeEpoch(epoch, room?.encryption?.currentKeyEpoch || 1);
    const participantIds = new Set(
      (room.participants || []).map((id) => id.toString())
    );

    const ops = envelopes.map((entry) => {
      const recipientUserId = String(entry?.recipientUserId || "");
      if (!participantIds.has(recipientUserId)) {
        throw new Error("Envelope recipient must be a room participant");
      }
      return {
        updateOne: {
          filter: {
            roomId,
            epoch: normalizedEpoch,
            recipientUserId,
          },
          update: {
            $set: {
              senderUserId: callerId,
              algorithm: entry?.algorithm || "X25519-HKDF-AES-256-GCM",
              ephemeralPublicKey: entry?.ephemeralPublicKey,
              iv: entry?.iv,
              salt: entry?.salt,
              ciphertext: entry?.ciphertext,
              tag: entry?.tag,
            },
          },
          upsert: true,
        },
      };
    });

    for (const envelope of envelopes) {
      if (
        !envelope?.recipientUserId ||
        !envelope?.ephemeralPublicKey ||
        !envelope?.iv ||
        !envelope?.salt ||
        !envelope?.ciphertext ||
        !envelope?.tag
      ) {
        return res.status(400).json({ message: "Invalid envelope payload" });
      }
    }

    await RoomKeyEnvelope.bulkWrite(ops);

    await MatchRoom.findByIdAndUpdate(roomId, {
      $set: {
        "encryption.enabled": true,
        "encryption.currentKeyEpoch": normalizedEpoch,
      },
    });

    return res.status(200).json({
      roomId,
      epoch: normalizedEpoch,
      count: envelopes.length,
    });
  } catch (error) {
    console.error("[crypto] upsertRoomEnvelopes failed:", error);
    return res.status(500).json({ message: "Failed to store room envelopes" });
  }
};

export const getRoomEnvelopes = async (req, res) => {
  try {
    const callerId = req.user._id;
    const { roomId } = req.params;
    const epoch = normalizeEpoch(req.query?.epoch, null);

    if (!roomId || !mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ message: "Invalid roomId" });
    }

    const room = await MatchRoom.findById(roomId).lean();
    if (!room || !isRoomParticipant(room, callerId)) {
      return res.status(403).json({ message: "Not authorized for this room" });
    }

    const filter = {
      roomId,
      recipientUserId: callerId,
    };

    if (epoch) {
      filter.epoch = epoch;
    }

    const envelopes = await RoomKeyEnvelope.find(filter)
      .sort({ epoch: -1, updatedAt: -1 })
      .lean();

    return res.status(200).json(envelopes);
  } catch (error) {
    console.error("[crypto] getRoomEnvelopes failed:", error);
    return res.status(500).json({ message: "Failed to fetch room envelopes" });
  }
};
