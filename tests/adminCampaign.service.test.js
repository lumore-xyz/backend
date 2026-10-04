import assert from "node:assert/strict";
import test from "node:test";
import { sendAdminCampaignMessage } from "../services/adminCampaign.service.js";

test("sendAdminCampaignMessage rejects unsupported channels before resolving recipients", async () => {
  const response = await sendAdminCampaignMessage({
    input: { channel: "sms", targetType: "users" },
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.payload, {
    success: false,
    message: "channel must be push or email",
  });
});
