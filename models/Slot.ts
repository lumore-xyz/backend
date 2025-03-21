// /models/Slot.js
import mongoose from "mongoose";

const slotSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // Owner of the slot
    profile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    }, // Profile that occupies the slot
  },
  { timestamps: true }
);

export default mongoose.model("Slot", slotSchema);
