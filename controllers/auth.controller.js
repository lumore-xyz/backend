// import { parse, validate } from "@tma.js/init-data-node";
// new push
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import { grantSignupBonusIfMissing } from "../services/credits.service.js";
import { sendEmailViaNodemailer } from "../services/nodemailer.service.js";
import {
  buildPasswordResetLink,
  createPasswordResetToken,
  getPasswordResetExpiryMinutes,
  hashPasswordResetToken,
  isStrongPassword,
  isValidEmail,
  normalizeEmail,
} from "../services/passwordReset.service.js";

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "postmessage",
);

// Generate JWT Token (id = userId)
const generateToken = (id) => {
  const accessToken = jwt.sign({ id }, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRY,
  });
  const refreshToken = jwt.sign({ id }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
  });

  return { accessToken, refreshToken };
};

const PASSWORD_RESET_GENERIC_MESSAGE =
  "If an account exists for this email, a password reset link has been sent.";
const PASSWORD_RESET_SUBJECT = "Reset your Lumore password";

const buildPasswordResetEmailContent = ({ resetUrl, expiryMinutes }) => {
  const htmlBody = `
    <p>Hi test,</p>
    <p>We received a request to reset your Lumore password.</p>
    <p>Use the button below within <strong>${expiryMinutes} minute(s)</strong>.</p>
    <p>
      <a href="${resetUrl}" style="display:inline-block;padding:10px 16px;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;">
        Reset Password
      </a>
    </p>
    <p>If the button does not work, copy and paste this link:</p>
    <p><a href="${resetUrl}">${resetUrl}</a></p>
    <p>If you did not request this, you can safely ignore this email.</p>
    <p>Team Lumore</p>
  `;

  return { htmlBody };
};

// Signup user
export const signup = async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");

  try {
    if (!email || !isValidEmail(email)) {
      return res
        .status(400)
        .json({ message: "Please provide a valid email address." });
    }

    if (!password) {
      return res.status(400).json({ message: "Password is required." });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        message:
          "Password must include uppercase, lowercase, number, and special character.",
      });
    }

    const existingUser = await User.findOne({ email }).select("_id");
    if (existingUser) {
      return res.status(409).json({ message: "Email is already registered." });
    }

    const emailPrefix = email.split("@")[0] || "user";
    const username = await generateUniqueUsername(emailPrefix);

    const user = await User.create({
      username,
      email,
      password,
    });

    await grantSignupBonusIfMissing(user._id);
    await user.updateLastActive();
    const { accessToken, refreshToken } = generateToken(user?._id);

    return res.status(201).json({
      user,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.email) {
      return res.status(409).json({ message: "Email is already registered." });
    }
    console.error("Signup error:", error);
    return res
      .status(500)
      .json({ message: "Unable to create account right now." });
  }
};

// Local Login
export const login = async (req, res) => {
  const { identifier, password } = req.body;

  try {
    const user = await User.findOne({
      $or: [{ email: identifier }, { username: identifier }],
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const isMatched = await user.comparePassword(password);

    if (isMatched) {
      await user.updateLastActive();
      const { accessToken, refreshToken } = generateToken(user?._id);
      res.status(200).json({
        user,
        accessToken,
        refreshToken,
      });
    } else {
      res.status(401).json({ message: "Invalid credentials" });
    }
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Google Login / Create User // app-focused
export const googleLogin = async (req, res) => {
  const { id_token } = req.body;
  try {
    const tickit = await client.verifyIdToken({
      idToken: id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = tickit.getPayload();
    const { email, sub: googleId, name, picture, email_verified } = payload;
    if (!email_verified) {
      return res.status(400).json("email not verified by google");
    }
    const uniqueUsername = await generateUniqueUsername(name);
    let isNewUser = false;
    let user = await User.findOne({ googleId });

    if (!user) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        existingUser.googleId = googleId;
        existingUser.emailVerified = email_verified;
        await existingUser.save();
        user = existingUser;
      } else {
        user = await User.create({
          googleId,
          email,
          username: uniqueUsername,
          emailVerified: email_verified,
          profilePicture: picture,
        });
        await grantSignupBonusIfMissing(user._id);
        isNewUser = true;
      }
    }
    await user.updateLastActive();
    const { accessToken, refreshToken } = generateToken(user?._id);
    res.status(200).json({
      isNewUser,
      user,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
export const googleLoginWeb = async (req, res) => {
  const { code } = req.body;
  try {
    const { tokens } = await client.getToken(code); // exchange code for tokens
    const tickit = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = await tickit.getPayload();
    const { email, sub: googleId, name, picture, email_verified } = payload;
    if (!email_verified) {
      return res.status(400).json("email not verified by google");
    }
    const uniqueUsername = await generateUniqueUsername(name);
    let isNewUser = false;
    let user = await User.findOne({ googleId });
    if (!user) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        existingUser.googleId = googleId;
        existingUser.emailVerified = email_verified;
        await existingUser.save();
        user = existingUser;
      } else {
        user = await User.create({
          googleId,
          email,
          username: uniqueUsername,
          emailVerified: email_verified,
          profilePicture: picture,
        });
        await grantSignupBonusIfMissing(user._id);
        isNewUser = true;
      }
    }
    await user.updateLastActive();
    const { accessToken, refreshToken } = generateToken(user?._id);
    res.status(200).json({
      isNewUser,
      user,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
export const tma_login = async (req, res) => {
  const { initData } = req.body;
  // const bot_token = process.env.TMA_BOT_TOKEN;
  try {
    // const init_data = parse(initData);
    const { user } = initData;
    // validate(initData, bot_token);
    const uniqueUsername = await generateUniqueUsername(user?.username);
    let isNewUser = false;

    let _user = await User.findOne({ telegramId: user?.id });
    if (!_user) {
      _user = await User.create({
        telegramId: user?.id,
        username: uniqueUsername,
        profilePicture: user?.photo_url,
      });
      await grantSignupBonusIfMissing(_user._id);
      isNewUser = true;
    }
    await _user.updateLastActive();
    const { accessToken, refreshToken } = generateToken(_user?._id);
    res.status(200).json({
      isNewUser,
      user: _user,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const refreshToken = async (req, res) => {
  const { refreshToken: reqRefreshToken } = req.body;
  if (!refreshToken) {
    return res.status(401).json({
      error: "No refresh token provided",
    });
  }
  try {
    const decoded = jwt.verify(
      reqRefreshToken,
      process.env.REFRESH_TOKEN_SECRET,
    );
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const newAccessToken = jwt.sign(
      { id: user._id },
      process.env.ACCESS_TOKEN_SECRET,
      {
        expiresIn: process.env.ACCESS_TOKEN_EXPIRY,
      },
    );
    res.status(200).json({ accessToken: newAccessToken });
  } catch (error) {
    console.error("Refresh token error", error);
    res.status(403).json({ error: "Invalid or expired refresh token" });
  }
};

export const forgotPassword = async (req, res) => {
  const email = normalizeEmail(req.body?.email);

  if (!email || !isValidEmail(email)) {
    return res
      .status(400)
      .json({ message: "Please provide a valid email address." });
  }

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(200).json({ message: "user not found" });
    }

    const { token, hashedToken, expiresAt } = createPasswordResetToken();
    user.passwordResetToken = hashedToken;
    user.passwordResetExpiresAt = expiresAt;
    await user.save({ validateBeforeSave: false });

    const resetUrl = buildPasswordResetLink({ token, email });
    const expiryMinutes = getPasswordResetExpiryMinutes();
    const { htmlBody } = buildPasswordResetEmailContent({
      resetUrl,
      expiryMinutes,
    });

    try {
      await sendEmailViaNodemailer({
        emails: [email],
        subject: PASSWORD_RESET_SUBJECT,
        htmlBody,
        fromEmail: "noreply@lumore.xyz",
      });
    } catch (emailError) {
      user.passwordResetToken = null;
      user.passwordResetExpiresAt = null;
      await user.save({ validateBeforeSave: false });
      throw emailError;
    }

    return res.status(200).json({ message: PASSWORD_RESET_GENERIC_MESSAGE });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({
      message: "Unable to send reset email right now. Please try again later.",
    });
  }
};

export const resetPassword = async (req, res) => {
  const token = String(req.body?.token || "").trim();
  const newPassword = String(req.body?.newPassword || "");

  if (!token) {
    return res.status(400).json({ message: "Reset token is required." });
  }

  if (!newPassword) {
    return res.status(400).json({ message: "New password is required." });
  }

  if (!isStrongPassword(newPassword)) {
    return res.status(400).json({
      message:
        "Password must include uppercase, lowercase, number, and special character.",
    });
  }

  try {
    const hashedToken = hashPasswordResetToken(token);
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpiresAt: { $gt: new Date() },
    });

    if (!user) {
      return res
        .status(400)
        .json({ message: "Reset link is invalid or has expired." });
    }

    user.password = newPassword;
    user.passwordResetToken = null;
    user.passwordResetExpiresAt = null;
    user.lastActive = Date.now();

    await user.save();

    return res.status(200).json({
      message:
        "Password reset successful. You can now log in with your new password.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({
      message: "Unable to reset password right now. Please try again later.",
    });
  }
};

// Set Password for Google Users
export const setPassword = async (req, res) => {
  const { newPassword } = req.body;
  const userId = req.user.id;

  try {
    const user = await User.findById(userId).select("+password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.googleId) {
      return res.status(400).json({ message: "Password already set" });
    }

    // Hash new password before saving
    user.password = newPassword; // Set the raw password, let the pre-save hook hash it
    await user.save();

    // Verify the password was set correctly
    const updatedUser = await User.findById(userId).select("+password");
    if (!updatedUser.password) {
      return res.status(500).json({ message: "Failed to set password" });
    }

    await user.updateLastActive();
    res.json({ message: "Password set successfully" });
  } catch (error) {
    console.error("Set password error:", error);
    res.status(500).json({ message: error.message });
  }
};

// velidate username is unique
export const isUniqueUsername = async (req, res) => {
  try {
    const { username } = req.params;

    const exists = await User.exists({ username });

    return res.json({ isUnique: !exists }); // ✅ Return JSON response
  } catch (error) {
    console.error("Error checking username uniqueness:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export async function generateUniqueUsername(name) {
  let baseUsername = generateCleanUsername(name);

  // If base username is empty, default to 'user'
  if (!baseUsername) baseUsername = "user";

  let exists = await User.findOne({ username: baseUsername });

  if (!exists) return baseUsername; // If username is unique, return it

  // Generate new usernames in bulk (up to 10 variations per query)
  let counter = 1;
  let newUsername = `${baseUsername}_${counter}`;

  while (await User.findOne({ username: newUsername })) {
    counter++;
    newUsername = `${baseUsername}_${counter}`;

    // Avoid infinite loops by limiting iterations
    if (counter > 100) throw new Error("Failed to generate a unique username.");
  }

  return newUsername;
}
export function generateCleanUsername(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "") // Remove apostrophes and similar characters
    .replace(/\s+/g, "_") // Replace spaces with underscores
    .replace(/[^a-z0-9._]/g, "") // Remove special characters except dots and underscores
    .replace(/\.{2,}/g, ".") // Replace multiple dots with a single dot
    .replace(/^\.|\.$/g, ""); // Remove leading/trailing dots
}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
}
