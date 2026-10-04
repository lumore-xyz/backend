import { createChatReport } from "../services/report.service.js";
import { REPORT_CATEGORIES } from "../utils/report.js";

export const reportChatUser = async (req, res) => {
  const userId = req.user._id;
  const { roomId } = req.params;
  const { category, reason, details } = req.body || {};

  const result = await createChatReport({
    userId,
    roomId,
    category,
    reason,
    details,
  });
  if (result.error === "ROOM_NOT_FOUND") {
    return res.status(404).json({ message: "Room not found" });
  }
  if (result.error === "INVALID_ROOM_PARTICIPANTS") {
    return res.status(400).json({ message: "Invalid room participants" });
  }
  if (result.error === "CATEGORY_REQUIRED") {
    return res.status(400).json({ message: "Report category is required" });
  }
  if (result.error === "INVALID_CATEGORY") {
    return res.status(400).json({
      message: `Invalid report category. Allowed values: ${REPORT_CATEGORIES.join(", ")}`,
    });
  }
  return res.status(201).json(result.report);
};
