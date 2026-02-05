import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
  {
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reportedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MatchRoom",
      required: true,
    },
    category: {
      type: String,
      enum: [
        "spam",
        "harassment",
        "nudity",
        "hate_speech",
        "scam_fraud",
        "other",
        "impersonation",
        "underage",
        "violence",
        "threats",
        "self_harm",
        "bullying",
      ],
      required: true,
    },
    reason: {
      type: String,
      maxLength: 2000,
    },
    details: {
      type: String,
      maxLength: 5000,
    },
    status: {
      type: String,
      enum: ["open", "reviewing", "closed"],
      default: "open",
    },
  },
  { timestamps: true }
);

reportSchema.index({ reporter: 1, reportedUser: 1, roomId: 1 });

const Report = mongoose.model("Report", reportSchema);

export default Report;
