import {
  listAdminReports,
  updateAdminReportStatus,
} from "../services/report.service.js";
import { getPagination } from "../utils/pagination.js";
import { REPORT_STATUSES } from "../utils/report.js";

export const getReportedUsersAdmin = async (req, res) => {
  const { page, limit } = getPagination(req.query);
  const status = String(req.query.status || "").trim();
  const { rows, total, hasMore } = await listAdminReports({ page, limit, status });

  return res.status(200).json({
    success: true,
    data: rows,
    pagination: { page, limit, total, hasMore },
  });
};

export const updateReportedUserStatusAdmin = async (req, res) => {
  const { reportId } = req.params;
  const { status } = req.body || {};

  if (!REPORT_STATUSES.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `status must be ${REPORT_STATUSES.join(", ")}`,
    });
  }

  const report = await updateAdminReportStatus({ reportId, status });

  if (!report) {
    return res
      .status(404)
      .json({ success: false, message: "Report not found" });
  }

  return res.status(200).json({
    success: true,
    message: "Report status updated",
    data: report,
  });
};
