import assert from "node:assert/strict";
import test from "node:test";
import { Types } from "mongoose";
import { isValidObjectId } from "../utils/objectId.js";

test("isValidObjectId accepts ObjectIds and valid hex IDs only", () => {
  assert.equal(isValidObjectId(new Types.ObjectId()), true);
  assert.equal(isValidObjectId("507f1f77bcf86cd799439011"), true);
  assert.equal(isValidObjectId("not-an-id"), false);
  assert.equal(isValidObjectId(null), false);
});
