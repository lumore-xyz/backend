import { normalizeString } from "./strings.js";

export const SUPPORTED_GENDERS = new Set(["man", "woman"]);
export const ANY_GENDER_VALUES = new Set(["everyone", "all", "any"]);

export const normalizeInterestedIn = (value) => {
  const normalized = normalizeString(value);
  return SUPPORTED_GENDERS.has(normalized) ? normalized : null;
};

export const inferInterestedInFromGender = (gender) => {
  const normalized = normalizeString(gender);
  if (normalized === "man") return "woman";
  if (normalized === "woman") return "man";
  return null;
};
