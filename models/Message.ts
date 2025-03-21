// /models/Message.js
import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    encryptedData: { type: Buffer, required: true }, // Store encrypted message as binary
    iv: { type: Buffer, required: true }, // Store IV as binary
    timestamp: { type: Date, default: Date.now, expires: "24h" }, // Auto-delete messages after 24 hours
  },
  { timestamps: true }
);

export default mongoose.model("Message", messageSchema);
