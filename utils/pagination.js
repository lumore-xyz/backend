export const getPagination = (
  query = {},
  { defaultPage = 1, defaultLimit = 20, maxLimit = 100 } = {},
) => {
  const requestedPage = Number(query.page);
  const requestedLimit = Number(query.limit);

  return {
    page:
      Number.isFinite(requestedPage) && requestedPage > 0
        ? Math.max(1, Math.floor(requestedPage))
        : defaultPage,
    limit:
      Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(Math.max(1, Math.floor(requestedLimit)), maxLimit)
        : defaultLimit,
  };
};

export const hasMorePages = ({ page, limit, total, itemCount }) =>
  (page - 1) * limit + itemCount < total;
