import mongoose from "mongoose";

const pushSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    subscription: {
      endpoint: { type: String, required: true },
      keys: {
        p256dh: { type: String, required: true },
        auth: { type: String, required: true },
      },
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

// Optional: Create a unique index to prevent duplicate subscriptions
pushSchema.index({ "subscription.endpoint": 1 }, { unique: true });

export default mongoose.model("Push", pushSchema);
