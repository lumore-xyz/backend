import test from "node:test";
import assert from "node:assert/strict";
import { getNextUtcDayStart, getUtcDayStart } from "../services/credits.service.js";

test("getUtcDayStart normalizes to UTC midnight", () => {
  const date = new Date("2026-02-14T18:33:22.000Z");
  const dayStart = getUtcDayStart(date);

  assert.equal(dayStart.toISOString(), "2026-02-14T00:00:00.000Z");
});

test("getNextUtcDayStart returns next UTC day midnight", () => {
  const date = new Date("2026-02-14T18:33:22.000Z");
  const nextDayStart = getNextUtcDayStart(date);

  assert.equal(nextDayStart.toISOString(), "2026-02-15T00:00:00.000Z");
});

