import { normalizeString } from "./strings.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_PATTERN =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!#%*?&])[A-Za-z\d@$#!%*?&]{8,25}$/;

export const PASSWORD_STRENGTH_MESSAGE =
  "Password must include uppercase, lowercase, number, and special character.";

export const normalizeEmail = normalizeString;

export const isValidEmail = (value) => EMAIL_PATTERN.test(normalizeEmail(value));

export const isStrongPassword = (value) =>
  PASSWORD_PATTERN.test(String(value || ""));
