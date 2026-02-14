import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "postmessage"
);

const generateToken = (id) => {
  const accessToken = jwt.sign({ id }, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRY,
  });
  const refreshToken = jwt.sign({ id }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
  });

  return { accessToken, refreshToken };
};

export const adminGoogleLoginWeb = async (req, res) => {
  const { code } = req.body;

  try {
    if (!code) {
      return res.status(400).json({ message: "Google auth code is required" });
    }

    const { tokens } = await client.getToken(code);
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, sub: googleId, email_verified } = payload;

    if (!email_verified) {
      return res.status(400).json({ message: "Email not verified by Google" });
    }

    const user = await User.findOne({ email }).select("-password");
    if (!user || !user.isAdmin) {
      return res.status(403).json({
        message: "Admin access denied",
      });
    }

    if (!user.googleId) {
      user.googleId = googleId;
      user.emailVerified = true;
      await user.save();
    }

    await user.updateLastActive();
    const { accessToken, refreshToken } = generateToken(user._id);

    return res.status(200).json({
      user,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("[admin-auth] Google login failed:", error);
    return res.status(500).json({ message: "Google login failed" });
  }
};

