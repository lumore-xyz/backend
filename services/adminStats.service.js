import CreditLedger from "../models/creditLedger.model.js";
import ThisOrThatQuestion from "../models/thisOrThatQuestion.model.js";
import User from "../models/user.model.js";
import { normalizeString } from "../utils/strings.js";
import { formattedAddressPartsExpression } from "../utils/location.js";
import { THIS_OR_THAT_QUESTION_STATUS } from "../utils/thisOrThat.js";
import { getInactiveUserCount } from "../utils/userActivity.js";
import { VERIFICATION_STATUS } from "../utils/verification.js";
import { getUserAccountStats } from "./userAccountStats.service.js";

const getCountryExpression = () => ({
  $toLower: {
    $trim: {
      input: { $arrayElemAt: ["$parts", -1] },
    },
  },
});

const getLocationAddressStages = () => [
  {
    $match: {
      "location.formattedAddress": { $type: "string", $ne: "" },
    },
  },
  {
    $project: {
      parts: formattedAddressPartsExpression(),
    },
  },
];

const getBucketCounts = (keys, rows) => {
  const counts = Object.fromEntries(keys.map((key) => [key, 0]));
  for (const { _id, count } of rows) {
    if (Object.hasOwn(counts, _id)) counts[_id] = count;
  }
  return counts;
};

const toLocationItem = ({ _id, count }) => ({
  key: _id,
  label: _id,
  count,
});

export const getAdminStatsData = async ({
  locationMode: requestedLocationMode = "global",
  country = "",
  locationLimit: requestedLocationLimit = 10,
  now = new Date(),
} = {}) => {
  const locationMode = String(requestedLocationMode || "global").toLowerCase();
  const selectedCountry = normalizeString(country);
  const locationLimit = Math.min(
    Math.max(Number(requestedLocationLimit) || 10, 1),
    30,
  );

  const [
    accountStats,
    pendingQuestions,
    onlineNow,
    verifiedUsers,
  ] = await Promise.all([
    getUserAccountStats(now),
    ThisOrThatQuestion.countDocuments({
      status: THIS_OR_THAT_QUESTION_STATUS.PENDING,
    }),
    User.countDocuments({ isActive: true, isArchived: { $ne: true } }),
    User.countDocuments({
      isArchived: { $ne: true },
      $or: [
        { isVerified: true },
        { verificationStatus: VERIFICATION_STATUS.APPROVED },
      ],
    }),
  ]);

  const { totalUsers, activeUsers, matchingUsers, archivedUsers } = accountStats;

  const [userFacets, creditAgg] = await Promise.all([
    User.aggregate([
      { $match: { isArchived: { $ne: true } } },
      {
        $facet: {
          gender: [
            {
              $project: {
                bucket: {
                  $switch: {
                    branches: [
                      {
                        case: { $regexMatch: {
                          input: { $ifNull: ["$gender", ""] },
                          regex: "^(male|man|m)$",
                          options: "i",
                        } },
                        then: "male",
                      },
                      {
                        case: { $regexMatch: {
                          input: { $ifNull: ["$gender", ""] },
                          regex: "^(female|woman|f)$",
                          options: "i",
                        } },
                        then: "female",
                      },
                      {
                        case: { $and: [
                          { $ne: ["$gender", null] },
                          { $ne: ["$gender", ""] },
                        ] },
                        then: "other",
                      },
                    ],
                    default: "unknown",
                  },
                },
              },
            },
            { $group: { _id: "$bucket", count: { $sum: 1 } } },
          ],
          verification: [
            {
              $project: {
                verificationStatus: {
                  $ifNull: ["$verificationStatus", VERIFICATION_STATUS.NOT_STARTED],
                },
              },
            },
            { $group: { _id: "$verificationStatus", count: { $sum: 1 } } },
          ],
          age: [
            { $match: { dob: { $type: "date" } } },
            {
              $addFields: {
                age: {
                  $dateDiff: { startDate: "$dob", endDate: now, unit: "year" },
                },
              },
            },
            {
              $project: {
                bucket: {
                  $switch: {
                    branches: [
                      { case: { $lt: ["$age", 18] }, then: "<18" },
                      { case: { $and: [{ $gte: ["$age", 18] }, { $lte: ["$age", 24] }] }, then: "18-24" },
                      { case: { $and: [{ $gte: ["$age", 25] }, { $lte: ["$age", 34] }] }, then: "25-34" },
                      { case: { $and: [{ $gte: ["$age", 35] }, { $lte: ["$age", 44] }] }, then: "35-44" },
                      { case: { $and: [{ $gte: ["$age", 45] }, { $lte: ["$age", 54] }] }, then: "45-54" },
                    ],
                    default: "55+",
                  },
                },
              },
            },
            { $group: { _id: "$bucket", count: { $sum: 1 } } },
          ],
          countries: [
            ...getLocationAddressStages(),
            { $project: { country: getCountryExpression() } },
            { $match: { country: { $type: "string", $ne: "" } } },
            { $group: { _id: "$country", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 100 },
          ],
          states: locationMode === "country" && selectedCountry
            ? [
                ...getLocationAddressStages(),
                {
                  $project: {
                    country: getCountryExpression(),
                    state: {
                      $let: {
                        vars: { size: { $size: "$parts" } },
                        in: {
                          $cond: [
                            { $gte: ["$$size", 2] },
                            { $toLower: { $trim: { input: {
                              $arrayElemAt: ["$parts", { $subtract: ["$$size", 2] }],
                            } } } },
                            "unknown",
                          ],
                        },
                      },
                    },
                  },
                },
                { $match: {
                  country: selectedCountry,
                  state: { $type: "string", $ne: "" },
                } },
                { $group: { _id: "$state", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: locationLimit },
              ]
            : [{ $match: { _id: { $exists: false } } }],
        },
      },
    ]).then(([facets]) => facets || {}),
    CreditLedger.aggregate([
      {
        $group: {
          _id: null,
          totalAwarded: {
            $sum: {
              $cond: [{ $gt: ["$amount", 0] }, "$amount", 0],
            },
          },
          totalSpent: {
            $sum: {
              $cond: [{ $lt: ["$amount", 0] }, "$amount", 0],
            },
          },
          transactions: { $sum: 1 },
        },
      },
    ]),
  ]);

  const genderAgg = userFacets.gender || [];
  const verificationAgg = userFacets.verification || [];
  const ageAgg = userFacets.age || [];
  const countriesAgg = userFacets.countries || [];
  const stateDistributionAgg = locationMode === "country" && selectedCountry
    ? userFacets.states || []
    : null;

  const genderDistribution = getBucketCounts(
    ["male", "female", "other", "unknown"],
    genderAgg,
  );
  const verificationBreakdown = getBucketCounts(
    Object.values(VERIFICATION_STATUS),
    verificationAgg,
  );
  const ageDistribution = getBucketCounts(
    ["<18", "18-24", "25-34", "35-44", "45-54", "55+"],
    ageAgg,
  );

  const availableCountries = countriesAgg.map(toLocationItem);

  const locationDistributionAgg =
    stateDistributionAgg ?? countriesAgg.slice(0, locationLimit);

  const locationDistribution = locationDistributionAgg.map(toLocationItem);

  const credit = creditAgg[0] || {
    totalAwarded: 0,
    totalSpent: 0,
    transactions: 0,
  };

  return {
    success: true,
    data: {
      totalUsers,
      activeUsers,
      matchingUsers,
      archivedUsers,
      pendingQuestions,
      onlineNow,
      verifiedUsers,
      inactiveUsers: getInactiveUserCount({
        totalUsers,
        archivedUsers,
        activeUsers,
      }),
      genderDistribution,
      verificationBreakdown,
      ageDistribution,
      locationAnalytics: {
        mode: locationMode === "country" ? "country" : "global",
        selectedCountry: selectedCountry || null,
        level: locationMode === "country" ? "state" : "country",
        distribution: locationDistribution,
        availableCountries,
      },
      credit,
    },
  };
};

