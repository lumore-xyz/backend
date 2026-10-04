import CreditLedger from "../models/creditLedger.model.js";
import { getPagination, hasMorePages } from "../utils/pagination.js";

export const getCreditLedgerPage = async ({ page = 1, limit = 20, userId, type } = {}) => {
  const { page: safePage, limit: safeLimit } = getPagination({ page, limit });
  const skip = (safePage - 1) * safeLimit;
  const filter = {
    ...(userId ? { user: userId } : {}),
    ...(type ? { type } : {}),
  };

  const [rows, total] = await Promise.all([
    CreditLedger.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .populate("user", "_id username email")
      .lean(),
    CreditLedger.countDocuments(filter),
  ]);

  return {
    data: rows,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      hasMore: hasMorePages({
        page: safePage,
        limit: safeLimit,
        total,
        itemCount: rows.length,
      }),
    },
  };
};
