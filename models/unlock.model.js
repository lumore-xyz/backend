import mongoose from "mongoose";

const unlockHistorySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  unlockedUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  unlockedAt: { type: Date, default: Date.now },
});

export default mongoose.model("UnlockHistory", unlockHistorySchema);
