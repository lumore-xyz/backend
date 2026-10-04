import CreditLedger from "../models/creditLedger.model.js";
import MatchRoom from "../models/room.model.js";
import { getUtcDayStart } from "../utils/utcDate.js";
import { CREDIT_LEDGER_TYPE } from "../utils/creditLedger.js";

const LEDGER_ANALYTICS_PERIODS = {
  daily: {
    dateFormat: "%Y-%m-%d",
    defaultLimit: 30,
    maxLimit: 90,
  },
  monthly: {
    dateFormat: "%Y-%m",
    defaultLimit: 12,
    maxLimit: 36,
  },
  yearly: {
    dateFormat: "%Y",
    defaultLimit: 5,
    maxLimit: 10,
  },
};

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const padDatePart = (value) => String(value).padStart(2, "0");

const getUtcBucketStart = (date, period) => {
  if (period === "yearly") {
    return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  }

  if (period === "monthly") {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  }

  return getUtcDayStart(date);
};

const addUtcBuckets = (date, period, amount) => {
  const next = new Date(date.getTime());

  if (period === "yearly") {
    next.setUTCFullYear(next.getUTCFullYear() + amount);
  } else if (period === "monthly") {
    next.setUTCMonth(next.getUTCMonth() + amount);
  } else {
    next.setUTCDate(next.getUTCDate() + amount);
  }

  return next;
};

const getBucketKey = (date, period) => {
  const year = date.getUTCFullYear();
  const month = padDatePart(date.getUTCMonth() + 1);
  const day = padDatePart(date.getUTCDate());

  if (period === "yearly") return String(year);
  if (period === "monthly") return `${year}-${month}`;
  return `${year}-${month}-${day}`;
};

const getBucketLabel = (date, period) => {
  const year = date.getUTCFullYear();
  const month = MONTH_LABELS[date.getUTCMonth()];

  if (period === "yearly") return String(year);
  if (period === "monthly") return `${month} ${year}`;
  return `${month} ${date.getUTCDate()}`;
};

const getLedgerAnalyticsWindow = (period, limit) => {
  const currentBucketStart = getUtcBucketStart(new Date(), period);
  const startAt = addUtcBuckets(currentBucketStart, period, -(limit - 1));
  const endAt = addUtcBuckets(currentBucketStart, period, 1);
  const buckets = [];

  for (let index = 0; index < limit; index += 1) {
    const date = addUtcBuckets(startAt, period, index);
    buckets.push({
      key: getBucketKey(date, period),
      label: getBucketLabel(date, period),
      count: 0,
    });
  }

  return { buckets, startAt, endAt };
};

const getSafeAnalyticsLimit = (rawLimit, config) => {
  const parsed = Number(rawLimit);
  const requested = Number.isFinite(parsed) ? parsed : config.defaultLimit;
  return Math.min(Math.max(Math.floor(requested), 1), config.maxLimit);
};

const mergeBucketCounts = (buckets, rows, getCount = (row) => row.count) => {
  const counts = new Map(
    rows.map((row) => [row._id, Math.max(Number(getCount(row)) || 0, 0)]),
  );

  return buckets.map((bucket) => ({
    ...bucket,
    count: counts.get(bucket.key) || 0,
  }));
};

const getLedgerCountsByPeriod = ({
  type,
  dateFormat,
  startAt,
  endAt,
  distinctUsers = false,
}) => {
  const bucketExpression = {
    $dateToString: {
      format: dateFormat,
      date: "$createdAt",
      timezone: "UTC",
    },
  };

  const pipeline = [
    {
      $match: {
        type,
        createdAt: { $gte: startAt, $lt: endAt },
      },
    },
  ];

  if (distinctUsers) {
    pipeline.push(
      {
        $group: {
          _id: {
            bucket: bucketExpression,
            user: "$user",
          },
        },
      },
      {
        $group: {
          _id: "$_id.bucket",
          count: { $sum: 1 },
        },
      },
    );
  } else {
    pipeline.push({
      $group: {
        _id: bucketExpression,
        count: { $sum: 1 },
      },
    });
  }

  pipeline.push({ $sort: { _id: 1 } });

  return CreditLedger.aggregate(pipeline);
};

const getMatchCountsByPeriod = ({ dateFormat, startAt, endAt }) =>
  MatchRoom.aggregate([
    { $match: { createdAt: { $gte: startAt, $lt: endAt } } },
    {
      $group: {
        _id: {
          $dateToString: {
            format: dateFormat,
            date: "$createdAt",
            timezone: "UTC",
          },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

export const getCreditLedgerAnalyticsData = async ({ period = "daily", limit } = {}) => {
  const normalizedPeriod = String(period || "daily").toLowerCase();
  const config = LEDGER_ANALYTICS_PERIODS[normalizedPeriod];
  if (!config) {
    throw Object.assign(new Error("period must be daily, monthly or yearly"), { statusCode: 400 });
  }

  const safeLimit = getSafeAnalyticsLimit(limit, config);
  const { buckets, startAt, endAt } = getLedgerAnalyticsWindow(normalizedPeriod, safeLimit);
  const [dailyActiveRows, signupRows, matchRows] = await Promise.all([
    getLedgerCountsByPeriod({ type: CREDIT_LEDGER_TYPE.DAILY_ACTIVE, dateFormat: config.dateFormat, startAt, endAt, distinctUsers: true }),
    getLedgerCountsByPeriod({ type: CREDIT_LEDGER_TYPE.SIGNUP_BONUS, dateFormat: config.dateFormat, startAt, endAt }),
    getMatchCountsByPeriod({ dateFormat: config.dateFormat, startAt, endAt }),
  ]);

  const dailyActive = mergeBucketCounts(buckets, dailyActiveRows);
  const signups = mergeBucketCounts(buckets, signupRows);
  const conversations = mergeBucketCounts(buckets, matchRows);
  const totalCount = (series) => series.reduce((sum, bucket) => sum + bucket.count, 0);

  return {
    period: normalizedPeriod,
    timezone: "UTC",
    range: { startAt, endAt },
    series: { dailyActive, signups, conversations },
    totals: {
      dailyActive: totalCount(dailyActive),
      signups: totalCount(signups),
      conversations: totalCount(conversations),
    },
  };
};
