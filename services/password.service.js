import User from "../models/user.model.js";
import { sendEmailViaNodemailer } from "./nodemailer.service.js";
import {
  buildPasswordResetLink,
  createPasswordResetToken,
  getPasswordResetExpiryMinutes,
  hashPasswordResetToken,
} from "./passwordReset.service.js";

const PASSWORD_RESET_SUBJECT = "Reset your Lumore password";

const buildPasswordResetEmail = ({ resetUrl, expiryMinutes }) => `
  <p>Hi there,</p>
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

export const sendPasswordResetEmail = async (email) => {
  const user = await User.findOne({ email });
  if (!user) return;

  const { token, hashedToken, expiresAt } = createPasswordResetToken();
  user.passwordResetToken = hashedToken;
  user.passwordResetExpiresAt = expiresAt;
  await user.save({ validateBeforeSave: false });

  try {
    const htmlBody = buildPasswordResetEmail({
      resetUrl: buildPasswordResetLink({ token, email }),
      expiryMinutes: getPasswordResetExpiryMinutes(),
    });
    await sendEmailViaNodemailer({
      emails: [email],
      subject: PASSWORD_RESET_SUBJECT,
      htmlBody,
      fromEmail: "noreply@lumore.xyz",
    });
  } catch (error) {
    user.passwordResetToken = null;
    user.passwordResetExpiresAt = null;
    await user.save({ validateBeforeSave: false });
    throw error;
  }
};

export const resetUserPassword = async ({ token, password }) => {
  const user = await User.findOne({
    passwordResetToken: hashPasswordResetToken(token),
    passwordResetExpiresAt: { $gt: new Date() },
  });
  if (!user) return false;

  user.password = password;
  user.passwordResetToken = null;
  user.passwordResetExpiresAt = null;
  user.lastActive = Date.now();
  await user.save();
  return true;
};

export const setUserPassword = async ({ userId, password }) => {
  const user = await User.findById(userId).select("+password");
  if (!user) return "USER_NOT_FOUND";
  if (!user.googleId) return "PASSWORD_ALREADY_SET";

  user.password = password;
  user.lastActive = new Date();
  await user.save();
  return "PASSWORD_SET";
};
