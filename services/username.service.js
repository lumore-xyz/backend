import User from "../models/user.model.js";
import { normalizeString } from "../utils/strings.js";

export async function generateUniqueUsername(name) {
  const baseUsername = generateCleanUsername(name) || "user";
  const candidates = [
    baseUsername,
    ...Array.from({ length: 100 }, (_, index) => `${baseUsername}_${index + 1}`),
  ];
  const existing = new Set(
    await User.distinct("username", { username: { $in: candidates } }),
  );
  const available = candidates.find((username) => !existing.has(username));
  if (available) return available;

  throw new Error("Failed to generate a unique username.");
}

export const isUsernameAvailable = async (username) =>
  !(await User.exists({ username }));

export function generateCleanUsername(name) {
  return normalizeString(name)
    .replace(/[’']/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9._]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.|\.$/g, "");
}
