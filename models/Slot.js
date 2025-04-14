// /models/Slot.js
import mongoose from "mongoose";

const slotSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // Owner of the slot
    profile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    }, // Profile that occupies the slot can be null
    roomId: {
      type: String,
      default: null,
    }, // Room ID can be null
    unReadMessageCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Slot", slotSchema);
