export const PROFILE_VISIBILITY_VALUES = ["public", "unlocked", "private"];

export const isProfileFieldVisible = (user, field, isUnlocked = false) => {
  const visibility =
    user?.fieldVisibility?.[field] ||
    (field === "hometown" ? user?.fieldVisibility?.homeTown : null) ||
    "public";

  return visibility === "public" || (visibility === "unlocked" && isUnlocked);
};
