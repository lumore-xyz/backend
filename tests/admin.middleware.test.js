import test from "node:test";
import assert from "node:assert/strict";
import { requireAdmin } from "../middleware/admin.middleware.js";

const createRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
};

test("requireAdmin allows isAdmin user", () => {
  const req = { user: { id: "u1", isAdmin: true }, headers: {} };
  const res = createRes();
  let called = false;
  const next = () => {
    called = true;
  };

  requireAdmin(req, res, next);
  assert.equal(called, true);
  assert.equal(res.statusCode, 200);
});

test("requireAdmin blocks non-admin", () => {
  const req = { user: { id: "u3", isAdmin: false }, headers: {} };
  const res = createRes();
  let called = false;
  const next = () => {
    called = true;
  };

  requireAdmin(req, res, next);
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.success, false);
});
