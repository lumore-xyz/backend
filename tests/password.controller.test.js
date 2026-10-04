import assert from "node:assert/strict";
import test from "node:test";
import User from "../models/user.model.js";
import { forgotPassword } from "../controllers/password.controller.js";

test("forgotPassword does not reveal whether an email is registered", async () => {
  const originalFindOne = User.findOne;
  User.findOne = async () => null;
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  try {
    await forgotPassword({ body: { email: "missing@example.com" } }, res);
    assert.equal(res.statusCode, 200);
    assert.match(res.body.message, /If an account exists/);
  } finally {
    User.findOne = originalFindOne;
  }
});
