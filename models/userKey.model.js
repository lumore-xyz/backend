import mongoose from "mongoose";

const userKeySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    identityPublicKey: {
      type: String,
      required: true,
      trim: true,
    },
    algorithm: {
      type: String,
      default: "X25519",
      trim: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("UserKey", userKeySchema);
