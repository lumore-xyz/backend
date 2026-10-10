import {
  authenticateGoogleUser,
  authenticateLocalUser,
  authenticateTelegramUser,
  createLocalAccount,
  getRefreshedAccessToken,
} from "../services/auth.service.js";
import {
  getGooglePayloadFromCode,
  getGooglePayloadFromIdToken,
} from "../services/googleAuth.service.js";
import { getTelegramUserFromInitData } from "../services/telegramAuth.service.js";
import { isUsernameAvailable } from "../services/username.service.js";
import {
  isStrongPassword,
  isValidEmail,
  normalizeEmail,
  PASSWORD_STRENGTH_MESSAGE,
} from "../utils/credentials.js";
import { logError } from "../utils/logError.js";

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
        message: PASSWORD_STRENGTH_MESSAGE,
      });
    }

    const result = await createLocalAccount({ email, password });
    if (result.error === "EMAIL_TAKEN") {
      return res.status(409).json({ message: "Email is already registered." });
    }

    return res.status(201).json({
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.email) {
      return res.status(409).json({ message: "Email is already registered." });
    }
    logError("Signup failed", error);
    return res
      .status(500)
      .json({ message: "Unable to create account right now." });
  }
};

export const login = async (req, res) => {
  const { identifier, password } = req.body || {};

  try {
    const result = await authenticateLocalUser({ identifier, password });
    if (!result) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }
    res.status(200).json(result);
  } catch (error) {
    logError("Login failed", error);
    res.status(500).json({ message: "Unable to sign in right now." });
  }
};

const respondToGoogleLogin = async (payload, res) => {
  const result = await authenticateGoogleUser(payload);
  if (result.emailNotVerified) {
    return res.status(400).json("email not verified by google");
  }
  if (result.accountArchived) {
    return res.status(403).json({ message: "Account is archived" });
  }
  if (result.underage) {
    return res.status(403).json({ message: "You must be 18 or older to use Lumore" });
  }
  return res.status(200).json(result);
};

const handleGoogleLogin = (credentialField, getPayload) => async (req, res) => {
  if (!req.body?.[credentialField]) {
    return res.status(400).json({ message: "Google credential is required" });
  }

  try {
    const payload = await getPayload(req);
    return await respondToGoogleLogin(payload, res);
  } catch (error) {
    logError("Google login failed", error);
    return res
      .status(500)
      .json({ message: "Unable to sign in with Google right now." });
  }
};

export const googleLogin = handleGoogleLogin("id_token", (req) =>
  getGooglePayloadFromIdToken(req.body.id_token),
);

export const googleLoginWeb = handleGoogleLogin("code", (req) =>
  getGooglePayloadFromCode(req.body.code),
);
export const tma_login = async (req, res) => {
  const initData = req.body?.initData;
  const botToken = process.env.TMA_BOT_TOKEN;
  if (typeof initData !== "string" || !initData.trim()) {
    return res.status(400).json({ message: "Telegram init data is required" });
  }
  if (!botToken) {
    return res.status(503).json({ message: "Telegram login is unavailable" });
  }

  let telegramUser;
  try {
    telegramUser = getTelegramUserFromInitData(initData, botToken);
  } catch {
    return res.status(401).json({ message: "Invalid or expired Telegram init data" });
  }
  if (!telegramUser?.id) {
    return res.status(400).json({ message: "Telegram user data is missing" });
  }

  try {
    const result = await authenticateTelegramUser(telegramUser);
    if (result.accountArchived) {
      return res.status(403).json({ message: "Account is archived" });
    }
    if (result.underage) {
      return res.status(403).json({ message: "You must be 18 or older to use Lumore" });
    }
    res.status(200).json(result);
  } catch (error) {
    logError("Telegram login failed", error);
    res.status(500).json({ message: "Unable to sign in with Telegram right now." });
  }
};

export const refreshToken = async (req, res) => {
  const reqRefreshToken = String(req.body?.refreshToken || "").trim();

  if (!reqRefreshToken) {
    return res.status(401).json({
      error: "No refresh token provided",
    });
  }

  try {
    const accessToken = await getRefreshedAccessToken(reqRefreshToken);
    if (!accessToken) {
      return res.status(401).json({ error: "Invalid or expired refresh token" });
    }

    return res.status(200).json({ accessToken });
  } catch (error) {
    if ([403, 404].includes(error.statusCode)) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    throw error;
  }
};

export const isUniqueUsername = async (req, res) => {
  try {
    const { username } = req.params;

    return res.json({ isUnique: await isUsernameAvailable(username) });
  } catch (error) {
    logError("Username availability check failed", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
