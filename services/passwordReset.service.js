import crypto from "node:crypto";
import { normalizeEmail } from "../utils/credentials.js";

const DEFAULT_PASSWORD_RESET_EXPIRY_MINUTES = 30;
const DEFAULT_PASSWORD_RESET_URL = "lumore://reset-password";
const PASSWORD_RESET_TOKEN_BYTES = 32;

const toInteger = (value, fallbackValue) => {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) ? parsed : fallbackValue;
};

export const getPasswordResetExpiryMinutes = () => {
  const minutes = toInteger(
    process.env.PASSWORD_RESET_EXPIRY_MINUTES,
    DEFAULT_PASSWORD_RESET_EXPIRY_MINUTES,
  );
  return minutes > 0 ? minutes : DEFAULT_PASSWORD_RESET_EXPIRY_MINUTES;
};

const getPasswordResetExpiryMs = () =>
  getPasswordResetExpiryMinutes() * 60 * 1000;

const appendQueryParams = (baseUrl, params) => {
  const query = new URLSearchParams(
    Object.entries(params || {}).filter(([, value]) =>
      String(value || "").trim(),
    ),
  ).toString();
  if (!query) return baseUrl;

  const separator = /[?&]$/.test(baseUrl)
    ? ""
    : baseUrl.includes("?")
      ? "&"
      : "?";
  return `${baseUrl}${separator}${query}`;
};

export const buildPasswordResetLink = ({ token, email }) => {
  const safeToken = String(token || "").trim();
  const safeEmail = normalizeEmail(email);

  if (!safeToken) throw new Error("Reset token is required");
  if (!safeEmail) throw new Error("Email is required");

  const template = String(process.env.PASSWORD_RESET_URL_TEMPLATE || "").trim();
  if (template) {
    return template
      .replace(/\{token\}/g, encodeURIComponent(safeToken))
      .replace(/\{email\}/g, encodeURIComponent(safeEmail));
  }

  const baseUrl =
    String(process.env.PASSWORD_RESET_URL || "").trim() ||
    DEFAULT_PASSWORD_RESET_URL;

  return appendQueryParams(baseUrl, { token: safeToken, email: safeEmail });
};

export const hashPasswordResetToken = (token) =>
  crypto.createHash("sha256").update(String(token || "").trim()).digest("hex");

export const createPasswordResetToken = () => {
  const token = crypto.randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString("hex");
  const hashedToken = hashPasswordResetToken(token);
  const expiresAt = new Date(Date.now() + getPasswordResetExpiryMs());

  return {
    token,
    hashedToken,
    expiresAt,
  };
};
