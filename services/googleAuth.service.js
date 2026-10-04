import { OAuth2Client } from "google-auth-library";

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "postmessage",
);

export const getGooglePayloadFromIdToken = async (idToken) => {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  return ticket.getPayload();
};

export const getGooglePayloadFromCode = async (code) => {
  const { tokens } = await client.getToken(code);
  return getGooglePayloadFromIdToken(tokens.id_token);
};
