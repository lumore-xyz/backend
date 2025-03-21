import mongoose from "mongoose";

const rejectedProfileSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  rejectedUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  rejectedAt: { type: Date, default: Date.now },
});

export default mongoose.model("RejectedProfiles", rejectedProfileSchema);
