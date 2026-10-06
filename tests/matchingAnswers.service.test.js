import test from "node:test";
import assert from "node:assert/strict";
import ThisOrThatQuestion from "../models/thisOrThatQuestion.model.js";
import { getReadableAnswersByUser } from "../services/matchingAnswers.service.js";

test("prompt enrichment fetches at most ten valid answers per user", async (t) => {
  const answers = new Map(Array.from({ length: 25 }, (_, i) => [String(i).padStart(24, "0"), "left"]));
  answers.set("invalid", "unknown");
  t.mock.method(ThisOrThatQuestion, "find", (query) => {
    assert.equal(query._id.$in.length, 10);
    assert.ok(!query._id.$in.includes("invalid"));
    return { select() { return this; }, lean: async () => query._id.$in.map((_id) => ({ _id, leftOption: "Tea", rightOption: "Coffee" })) };
  });
  const result = await getReadableAnswersByUser({ userIds: ["u1"], answersByUser: new Map([["u1", answers]]) });
  assert.equal(result.get("u1").length, 10);
  assert.equal(result.get("u1")[0].answer, "Tea");
});

test("optional question enrichment degrades without aborting matching", async (t) => {
  t.mock.method(ThisOrThatQuestion, "find", () => ({ select() { return this; }, lean: async () => { throw new Error("Question read unavailable"); } }));
  const result = await getReadableAnswersByUser({ userIds: ["u1"], answersByUser: new Map([["u1", new Map([["q1", "left"]])]]) });
  assert.equal(result.size, 0);
});
