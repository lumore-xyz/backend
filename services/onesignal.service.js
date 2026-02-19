import axios from "axios";

const ONESIGNAL_API_URL = "https://api.onesignal.com/notifications";

export const sendEmailViaOneSignal = async ({ emails, subject, body }) => {
  const appId = process.env.ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_API_KEY;

  if (!appId || !apiKey) {
    throw new Error("ONESIGNAL_APP_ID and ONESIGNAL_API_KEY are required");
  }

  const uniqueEmails = Array.from(
    new Set(
      (emails || [])
        .map((email) => String(email || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );

  if (!uniqueEmails.length) {
    throw new Error("No valid email recipients found");
  }

  const payload = {
    app_id: appId,
    include_email_tokens: uniqueEmails,
    email_subject: subject,
    email_body: body,
  };

  const response = await axios.post(ONESIGNAL_API_URL, payload, {
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    timeout: 20_000,
  });

  return response.data;
};
