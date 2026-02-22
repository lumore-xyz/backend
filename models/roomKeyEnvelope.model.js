import mongoose from "mongoose";

const roomKeyEnvelopeSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MatchRoom",
      required: true,
      index: true,
    },
    epoch: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    recipientUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    senderUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    algorithm: {
      type: String,
      default: "X25519-HKDF-AES-256-GCM",
    },
    ephemeralPublicKey: {
      type: String,
      required: true,
    },
    iv: {
      type: String,
      required: true,
    },
    salt: {
      type: String,
      required: true,
    },
    ciphertext: {
      type: String,
      required: true,
    },
    tag: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

roomKeyEnvelopeSchema.index(
  { roomId: 1, epoch: 1, recipientUserId: 1 },
  { unique: true, name: "room_epoch_recipient_unique" }
);

export default mongoose.model("RoomKeyEnvelope", roomKeyEnvelopeSchema);
