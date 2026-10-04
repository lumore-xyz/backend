import {
  listAdminUsers,
  updateAdminUserArchiveStatus,
} from "../services/adminUser.service.js";
import { getPagination } from "../utils/pagination.js";
import { sanitizeUserFilters } from "../utils/userFilters.js";

export const getAdminUsers = async (req, res) => {
  const { page, limit } = getPagination(req.query);
  const search = String(req.query.search || "").trim();
  const rawFilters = { ...req.query };
  delete rawFilters.page;
  delete rawFilters.limit;
  delete rawFilters.search;
  const { filters, error } = sanitizeUserFilters(rawFilters);

  if (error) {
    return res.status(400).json({ success: false, message: error });
  }

  const { users, total, hasMore } = await listAdminUsers({
    page,
    limit,
    search,
    filters,
  });

  return res.status(200).json({
    success: true,
    data: users,
    pagination: { page, limit, total, hasMore },
  });
};
export const updateUserArchiveStatus = async (req, res) => {
  const { userId } = req.params;
  const { isArchived } = req.body || {};

  if (typeof isArchived !== "boolean") {
    return res.status(400).json({
      success: false,
      message: "isArchived must be boolean",
    });
  }

  const user = await updateAdminUserArchiveStatus({ userId, isArchived });

  if (!user) {
    return res
      .status(404)
      .json({ success: false, message: "User not found" });
  }

  return res.status(200).json({
    success: true,
    message: "User archive status updated",
    data: user,
  });
};
