import {
  isStrongPassword,
  isValidEmail,
  normalizeEmail,
  PASSWORD_STRENGTH_MESSAGE,
} from "../utils/credentials.js";
import {
  resetUserPassword,
  sendPasswordResetEmail,
  setUserPassword,
} from "../services/password.service.js";
import { logError } from "../utils/logError.js";

const PASSWORD_RESET_GENERIC_MESSAGE =
  "If an account exists for this email, a password reset link has been sent.";

export const forgotPassword = async (req, res) => {
  const email = normalizeEmail(req.body?.email);

  if (!email || !isValidEmail(email)) {
    return res
      .status(400)
      .json({ message: "Please provide a valid email address." });
  }

  try {
    await sendPasswordResetEmail(email);
    return res.status(200).json({ message: PASSWORD_RESET_GENERIC_MESSAGE });
  } catch (error) {
    logError("Forgot password request failed", error);
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
      message: PASSWORD_STRENGTH_MESSAGE,
    });
  }

  try {
    const reset = await resetUserPassword({ token, password: newPassword });
    if (!reset) {
      return res
        .status(400)
        .json({ message: "Reset link is invalid or has expired." });
    }

    return res.status(200).json({
      message:
        "Password reset successful. You can now log in with your new password.",
    });
  } catch (error) {
    logError("Password reset failed", error);
    return res.status(500).json({
      message: "Unable to reset password right now. Please try again later.",
    });
  }
};

export const setPassword = async (req, res) => {
  const newPassword = String(req.body?.newPassword || "");
  const userId = req.user.id;

  if (!newPassword) {
    return res.status(400).json({ message: "Password is required." });
  }
  if (!isStrongPassword(newPassword)) {
    return res.status(400).json({
      message: PASSWORD_STRENGTH_MESSAGE,
    });
  }

  try {
    const result = await setUserPassword({ userId, password: newPassword });
    if (result === "USER_NOT_FOUND") {
      return res.status(404).json({ message: "User not found" });
    }

    if (result === "PASSWORD_ALREADY_SET") {
      return res.status(400).json({ message: "Password already set" });
    }
    return res.json({ message: "Password set successfully" });
  } catch (error) {
    logError("Set password failed", error);
    res.status(500).json({ message: "Unable to set password right now." });
  }
};

