import CreditLedger from "../models/creditLedger.model.js";
import { getPagination, hasMorePages } from "../utils/pagination.js";

export const getCreditHistory = async (userId, page = 1, limit = 20) => {
  const pagination = getPagination({ page, limit });
  const skip = (pagination.page - 1) * pagination.limit;
  const [items, total] = await Promise.all([
    CreditLedger.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pagination.limit)
      .lean(),
    CreditLedger.countDocuments({ user: userId }),
  ]);
  const hasMore = hasMorePages({
    ...pagination,
    total,
    itemCount: items.length,
  });

  return {
    items,
    pagination: {
      ...pagination,
      total,
      hasMore,
      nextPage: hasMore ? pagination.page + 1 : null,
    },
  };
};
