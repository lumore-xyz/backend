import mongoose from "mongoose";

const userKeyBackupSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    encryptedPrivateKey: {
      type: String,
      required: true,
    },
    publicKeySpki: {
      type: String,
      default: null,
    },
    salt: {
      type: String,
      required: true,
    },
    kdfParams: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      default: {},
    },
    nonce: {
      type: String,
      required: true,
    },
    version: {
      type: Number,
      default: 1,
    },
    recoveryMethod: {
      type: String,
      enum: ["passphrase", "pin"],
      default: "passphrase",
    },
    recoveryEnabled: {
      type: Boolean,
      default: true,
    },
    pinHash: {
      type: String,
      default: null,
      select: false,
    },
    pinFailedAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    pinLockedUntil: {
      type: Date,
      default: null,
    },
    pinLastFailedAt: {
      type: Date,
      default: null,
    },
    upgradedFromPassphrase: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model("UserKeyBackup", userKeyBackupSchema);
