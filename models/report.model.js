import mongoose from "mongoose";
import { REPORT_CATEGORIES, REPORT_STATUSES } from "../utils/report.js";

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
      enum: REPORT_CATEGORIES,
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
      enum: REPORT_STATUSES,
      default: "open",
    },
  },
  { timestamps: true }
);

reportSchema.index({ reporter: 1, reportedUser: 1, roomId: 1 });

const Report = mongoose.model("Report", reportSchema);

export default Report;
