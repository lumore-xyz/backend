export const getUtcDateKey = (date) => date.toISOString().slice(0, 10);

export const getUtcDayStart = (date = new Date()) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

export const getNextUtcDayStart = (date = new Date()) => {
  const nextDayStart = getUtcDayStart(date);
  nextDayStart.setUTCDate(nextDayStart.getUTCDate() + 1);
  return nextDayStart;
};
