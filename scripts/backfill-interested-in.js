import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import User from "../models/user.model.js";
import UserPreference from "../models/preference.model.js";

const VALID_INTERESTED_IN = new Set(["man", "woman"]);

function normalizeInterestedIn(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return VALID_INTERESTED_IN.has(normalized) ? normalized : null;
}

function inferInterestedInFromGender(gender) {
  const normalizedGender = String(gender || "")
    .trim()
    .toLowerCase();
  if (normalizedGender === "man") return "woman";
  if (normalizedGender === "woman") return "man";
  return null;
}

async function run() {
  await connectDB();

  const preferenceRows = await UserPreference.find({})
    .select("_id user interestedIn")
    .lean();

  const userIds = Array.from(
    new Set(preferenceRows.map((row) => row.user?.toString()).filter(Boolean)),
  );

  const users = await User.find({ _id: { $in: userIds } })
    .select("_id gender")
    .lean();
  const genderByUserId = new Map(users.map((u) => [u._id.toString(), u.gender]));

  const updates = [];
  const unresolved = [];
  let unchanged = 0;

  for (const row of preferenceRows) {
    const current = normalizeInterestedIn(row.interestedIn);
    const userGender = genderByUserId.get(row.user?.toString() || "");
    const inferred = inferInterestedInFromGender(userGender);
    const next = current || inferred;

    if (!next) {
      unresolved.push({
        preferenceId: row._id.toString(),
        userId: row.user?.toString() || null,
        gender: userGender || null,
        interestedIn: row.interestedIn ?? null,
      });
      continue;
    }

    if (row.interestedIn === next) {
      unchanged += 1;
      continue;
    }

    updates.push({
      updateOne: {
        filter: { _id: row._id },
        update: { $set: { interestedIn: next } },
      },
    });
  }

  if (updates.length) {
    await UserPreference.bulkWrite(updates, { ordered: false });
  }

  console.info("[backfill-interested-in] complete", {
    totalPreferences: preferenceRows.length,
    updated: updates.length,
    unchanged,
    unresolved: unresolved.length,
  });

  if (unresolved.length) {
    console.info("[backfill-interested-in] unresolved_rows", unresolved);
  }
}

run()
  .catch((error) => {
    console.error("[backfill-interested-in] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
