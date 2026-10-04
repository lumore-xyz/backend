export const normalizeString = (value) => String(value || "").trim().toLowerCase();

export const trimString = (value) => String(value ?? "").trim();

export const normalizeStringList = (value) =>
  (Array.isArray(value) ? value : [value])
    .map(normalizeString)
    .filter(Boolean);

export const normalizeStringArray = (value) =>
  Array.isArray(value) ? normalizeStringList(value) : [];

export const normalizeUniqueStringList = (value) =>
  Array.from(new Set(normalizeStringArray(value)));
