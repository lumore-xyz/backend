import CreditLedger from "../models/creditLedger.model.js";
import UserPreference from "../models/preference.model.js";
import Report from "../models/report.model.js";
import ThisOrThatQuestion from "../models/thisOrThatQuestion.model.js";
import User from "../models/user.model.js";
import {
  buildPreferenceFilter,
  buildUserFilterClauses,
  hasAnySupportedFilters,
  hasPreferenceFilters,
  sanitizeUserFilters,
  splitUserAndPreferenceFilters,
} from "../utils/userFilters.js";

export const getAdminStats = async (req, res) => {
  try {
    const now = new Date();
    const onlineCutoff = new Date(now.getTime() - 5 * 60 * 1000); // last 5 minutes
    const locationMode = String(req.query.locationMode || "global").toLowerCase();
    const selectedCountry = String(req.query.country || "").trim().toLowerCase();
    const locationLimit = Math.min(
      Math.max(Number(req.query.locationLimit) || 10, 1),
      30,
    );

    const [
      totalUsers,
      activeUsers,
      matchingUsers,
      archivedUsers,
      pendingQuestions,
      onlineNow,
      verifiedUsers,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ isActive: true, isArchived: { $ne: true } }),
      User.countDocuments({ isMatching: true, isArchived: { $ne: true } }),
      User.countDocuments({ isArchived: true }),
      ThisOrThatQuestion.countDocuments({ status: "pending" }),
      User.countDocuments({
        isArchived: { $ne: true },
        lastActive: { $gte: onlineCutoff },
      }),
      User.countDocuments({ isVerified: true, isArchived: { $ne: true } }),
    ]);

    const [genderAgg, verificationAgg, ageAgg, countriesAgg] = await Promise.all([
      User.aggregate([
        {
          $match: {
            isArchived: { $ne: true },
          },
        },
        {
          $project: {
            bucket: {
              $switch: {
                branches: [
                  {
                    case: {
                      $regexMatch: {
                        input: { $ifNull: ["$gender", ""] },
                        regex: "^(male|man|m)$",
                        options: "i",
                      },
                    },
                    then: "male",
                  },
                  {
                    case: {
                      $regexMatch: {
                        input: { $ifNull: ["$gender", ""] },
                        regex: "^(female|woman|f)$",
                        options: "i",
                      },
                    },
                    then: "female",
                  },
                  {
                    case: {
                      $and: [
                        { $ne: ["$gender", null] },
                        { $ne: ["$gender", ""] },
                      ],
                    },
                    then: "other",
                  },
                ],
                default: "unknown",
              },
            },
          },
        },
        {
          $group: {
            _id: "$bucket",
            count: { $sum: 1 },
          },
        },
      ]),
      User.aggregate([
        {
          $match: {
            isArchived: { $ne: true },
          },
        },
        {
          $project: {
            verificationStatus: {
              $ifNull: ["$verificationStatus", "not_started"],
            },
          },
        },
        {
          $group: {
            _id: "$verificationStatus",
            count: { $sum: 1 },
          },
        },
      ]),
      User.aggregate([
        {
          $match: {
            isArchived: { $ne: true },
            dob: { $type: "date" },
          },
        },
        {
          $addFields: {
            age: {
              $dateDiff: {
                startDate: "$dob",
                endDate: now,
                unit: "year",
              },
            },
          },
        },
        {
          $project: {
            bucket: {
              $switch: {
                branches: [
                  { case: { $lt: ["$age", 18] }, then: "<18" },
                  {
                    case: {
                      $and: [{ $gte: ["$age", 18] }, { $lte: ["$age", 24] }],
                    },
                    then: "18-24",
                  },
                  {
                    case: {
                      $and: [{ $gte: ["$age", 25] }, { $lte: ["$age", 34] }],
                    },
                    then: "25-34",
                  },
                  {
                    case: {
                      $and: [{ $gte: ["$age", 35] }, { $lte: ["$age", 44] }],
                    },
                    then: "35-44",
                  },
                  {
                    case: {
                      $and: [{ $gte: ["$age", 45] }, { $lte: ["$age", 54] }],
                    },
                    then: "45-54",
                  },
                ],
                default: "55+",
              },
            },
          },
        },
        {
          $group: {
            _id: "$bucket",
            count: { $sum: 1 },
          },
        },
      ]),
      User.aggregate([
        {
          $match: {
            isArchived: { $ne: true },
            "location.formattedAddress": { $type: "string", $ne: "" },
          },
        },
        {
          $project: {
            parts: {
              $split: [
                { $trim: { input: "$location.formattedAddress" } },
                ",",
              ],
            },
          },
        },
        {
          $project: {
            country: {
              $toLower: {
                $trim: {
                  input: {
                    $arrayElemAt: ["$parts", -1],
                  },
                },
              },
            },
          },
        },
        {
          $match: {
            country: { $ne: "" },
          },
        },
        {
          $group: {
            _id: "$country",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 100 },
      ]),
    ]);

    const genderDistribution = {
      male: 0,
      female: 0,
      other: 0,
      unknown: 0,
    };
    for (const row of genderAgg) {
      if (genderDistribution[row._id] !== undefined) {
        genderDistribution[row._id] = row.count;
      }
    }

    const verificationBreakdown = {
      not_started: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      failed: 0,
    };
    for (const row of verificationAgg) {
      if (verificationBreakdown[row._id] !== undefined) {
        verificationBreakdown[row._id] = row.count;
      }
    }

    const ageDistribution = {
      "<18": 0,
      "18-24": 0,
      "25-34": 0,
      "35-44": 0,
      "45-54": 0,
      "55+": 0,
    };
    for (const row of ageAgg) {
      if (ageDistribution[row._id] !== undefined) {
        ageDistribution[row._id] = row.count;
      }
    }

    const availableCountries = countriesAgg.map((row) => ({
      key: row._id,
      label: row._id,
      count: row.count,
    }));

    let locationDistributionAgg = [];
    if (locationMode === "country" && selectedCountry) {
      locationDistributionAgg = await User.aggregate([
        {
          $match: {
            isArchived: { $ne: true },
            "location.formattedAddress": { $type: "string", $ne: "" },
          },
        },
        {
          $project: {
            parts: {
              $split: [
                { $trim: { input: "$location.formattedAddress" } },
                ",",
              ],
            },
          },
        },
        {
          $project: {
            country: {
              $toLower: {
                $trim: {
                  input: {
                    $arrayElemAt: ["$parts", -1],
                  },
                },
              },
            },
            state: {
              $let: {
                vars: { size: { $size: "$parts" } },
                in: {
                  $cond: [
                    { $gte: ["$$size", 2] },
                    {
                      $toLower: {
                        $trim: {
                          input: {
                            $arrayElemAt: ["$parts", { $subtract: ["$$size", 2] }],
                          },
                        },
                      },
                    },
                    "unknown",
                  ],
                },
              },
            },
          },
        },
        {
          $match: {
            country: selectedCountry,
            state: { $ne: "" },
          },
        },
        {
          $group: {
            _id: "$state",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: locationLimit },
      ]);
    } else {
      locationDistributionAgg = countriesAgg.slice(0, locationLimit);
    }

    const locationDistribution = locationDistributionAgg.map((row) => ({
      key: row._id,
      label: row._id,
      count: row.count,
    }));

    const creditAgg = await CreditLedger.aggregate([
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
    ]);

    const credit = creditAgg[0] || {
      totalAwarded: 0,
      totalSpent: 0,
      transactions: 0,
    };

    return res.status(200).json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        matchingUsers,
        archivedUsers,
        pendingQuestions,
        onlineNow,
        verifiedUsers,
        inactiveUsers: Math.max(totalUsers - activeUsers - archivedUsers, 0),
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
    });
  } catch (error) {
    console.error("[admin] getAdminStats failed:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getAdminUsers = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;
    const search = String(req.query.search || "").trim();
    const rawFilters = { ...req.query };
    delete rawFilters.page;
    delete rawFilters.limit;
    delete rawFilters.search;
    const { filters, error } = sanitizeUserFilters(rawFilters);

    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const clauses = [];
    if (search) {
      clauses.push({
        $or: [
        { username: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        ],
      });
    }
    const { userFilters, preferenceFilters } = splitUserAndPreferenceFilters(filters);
    clauses.push(...buildUserFilterClauses(userFilters));

    if (hasPreferenceFilters(preferenceFilters)) {
      const preferenceMatch = buildPreferenceFilter(preferenceFilters);
      const preferenceRows = await UserPreference.find(preferenceMatch)
        .select("user")
        .lean();
      const preferenceUserIds = Array.from(
        new Set(
          preferenceRows
            .map((row) => row.user?.toString())
            .filter(Boolean),
        ),
      );

      if (!preferenceUserIds.length && hasAnySupportedFilters(filters)) {
        return res.status(200).json({
          success: true,
          data: [],
          pagination: {
            page,
            limit,
            total: 0,
            hasMore: false,
          },
        });
      }

      clauses.push({ _id: { $in: preferenceUserIds } });
    }

    const filter = clauses.length ? { $and: clauses } : {};

    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select(
          "_id username realName profilePicture email phoneNumber gender dob work institution maritalStatus religion hometown languages isArchived isActive credits createdAt verificationStatus",
        )
        .lean(),
      User.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: users,
      pagination: {
        page,
        limit,
        total,
        hasMore: skip + users.length < total,
      },
    });
  } catch (error) {
    console.error("[admin] getAdminUsers failed:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updateUserArchiveStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isArchived } = req.body;

    if (typeof isArchived !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isArchived must be boolean",
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      {
        isArchived,
        archivedAt: isArchived ? new Date() : null,
        ...(isArchived ? { isActive: false, isMatching: false } : {}),
      },
      { returnDocument: "after" },
    )
      .select("_id username isArchived archivedAt")
      .lean();

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
  } catch (error) {
    console.error("[admin] updateUserArchiveStatus failed:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getPendingThisOrThatQuestions = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const [questions, total] = await Promise.all([
      ThisOrThatQuestion.find({ status: "pending" })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("submittedBy", "_id username email")
        .lean(),
      ThisOrThatQuestion.countDocuments({ status: "pending" }),
    ]);

    return res.status(200).json({
      success: true,
      data: questions,
      pagination: {
        page,
        limit,
        total,
        hasMore: skip + questions.length < total,
      },
    });
  } catch (error) {
    console.error("[admin] getPendingThisOrThatQuestions failed:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getCreditLedgerAdmin = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;
    const userId = req.query.userId;
    const type = req.query.type;

    const filter = {};
    if (userId) filter.user = userId;
    if (type) filter.type = type;

    const [rows, total] = await Promise.all([
      CreditLedger.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("user", "_id username email")
        .lean(),
      CreditLedger.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: rows,
      pagination: {
        page,
        limit,
        total,
        hasMore: skip + rows.length < total,
      },
    });
  } catch (error) {
    console.error("[admin] getCreditLedgerAdmin failed:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getReportedUsersAdmin = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;
    const status = String(req.query.status || "").trim();

    const filter = {};
    if (status) {
      filter.status = status;
    }

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

    return res.status(200).json({
      success: true,
      data: rows,
      pagination: {
        page,
        limit,
        total,
        hasMore: skip + rows.length < total,
      },
    });
  } catch (error) {
    console.error("[admin] getReportedUsersAdmin failed:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updateReportedUserStatusAdmin = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { status } = req.body;

    if (!["open", "reviewing", "closed"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "status must be open, reviewing or closed",
      });
    }

    const report = await Report.findByIdAndUpdate(
      reportId,
      { status },
      { returnDocument: "after" },
    )
      .populate("reporter", "_id username realName profilePicture email")
      .populate("reportedUser", "_id username realName profilePicture email isArchived isActive")
      .populate("roomId", "_id")
      .lean();

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
  } catch (error) {
    console.error("[admin] updateReportedUserStatusAdmin failed:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

