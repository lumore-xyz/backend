import assert from "node:assert/strict";
import test from "node:test";
import User from "../models/user.model.js";
import { getAppStatusData } from "../services/appStatus.service.js";

test("app status counts active users from the last 30 days and excludes archived users", async () => {
  const originalCountDocuments = User.countDocuments;
  const now = new Date("2026-10-04T12:00:00.000Z");
  const queries = [];
  User.countDocuments = async (query) => {
    queries.push(query);
    if (!Object.keys(query).length) return 10;
    if (query.isArchived === true) return 1;
    if (query.lastActive) return 4;
    if (query.isMatching) return 3;
    if (query.gender?.$regex?.source === "^woman$") return 2;
    if (query.gender?.$regex?.source === "^man$") return 3;
    return 0;
  };

  try {
    const data = await getAppStatusData({ now });
    const activeQuery = queries.find((query) => query.lastActive);
    assert.deepEqual(activeQuery, {
      isArchived: { $ne: true },
      lastActive: {
        $gte: new Date("2026-09-04T12:00:00.000Z"),
        $lte: now,
      },
    });
    assert.equal(data.activeUsers, 4);
    assert.equal(data.inactiveUsers, 5);
    assert.equal(data.genderDistribution.others, 5);
  } finally {
    User.countDocuments = originalCountDocuments;
  }
});
