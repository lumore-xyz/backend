import Report from "../models/report.model.js";
import MatchRoom from "../models/room.model.js";
import { getOtherParticipantId } from "../utils/matchRoom.js";
import { hasMorePages } from "../utils/pagination.js";
import { REPORT_CATEGORIES } from "../utils/report.js";

export const createChatReport = async ({
  userId,
  roomId,
  category,
  reason,
  details,
}) => {
  const room = await MatchRoom.findById(roomId).lean();
  if (!room) return { error: "ROOM_NOT_FOUND" };

  const reportedUser = getOtherParticipantId(room, userId);
  if (!reportedUser) return { error: "INVALID_ROOM_PARTICIPANTS" };
  if (!category) return { error: "CATEGORY_REQUIRED" };
  if (!REPORT_CATEGORIES.includes(category)) {
    return { error: "INVALID_CATEGORY" };
  }

  const report = await Report.create({
    reporter: userId,
    reportedUser,
    roomId,
    category,
    reason: reason?.trim() || "Report from chat",
    details: details?.trim() || "",
  });

  return { report };
};

export const listAdminReports = async ({ page, limit, status }) => {
  const skip = (page - 1) * limit;
  const filter = status ? { status } : {};
  const [rows, total] = await Promise.all([
    Report.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("reporter", "_id username realName profilePicture email")
      .populate("reportedUser", "_id username realName profilePicture email isArchived isActive")
      .populate("roomId", "_id")
      .lean(),
    Report.countDocuments(filter),
  ]);

  return {
    rows,
    total,
    hasMore: hasMorePages({ page, limit, total, itemCount: rows.length }),
  };
};

export const updateAdminReportStatus = ({ reportId, status }) =>
  Report.findByIdAndUpdate(reportId, { status }, { returnDocument: "after" })
    .populate("reporter", "_id username realName profilePicture email")
    .populate("reportedUser", "_id username realName profilePicture email isArchived isActive")
    .populate("roomId", "_id")
    .lean();
