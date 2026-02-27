import AppOptions from "../models/appOptions.model.js";

const DEFAULT_OPTIONS = {
  campaignFromEmailOptions: [
    { label: "noreply@lumore.xyz", value: "noreply@lumore.xyz" },
    { label: "kritik@lumore.xyz", value: "kritik@lumore.xyz" },
  ],
  genderOptions: [
    { label: "Woman", value: "woman" },
    { label: "Man", value: "man" },
  ],
  interestedInOptions: [
    { label: "woman", value: "woman" },
    { label: "Man", value: "man" },
  ],
  goalOptions: [
    { label: "A Serious Relationship", value: "serious-relationship" },
    { label: "Marriage or Life Partnership", value: "marriage" },
    { label: "Something Casual or Fun", value: "casual" },
    { label: "Friendship & Shared Interests", value: "friendship" },
    { label: "Open to Exploring", value: "open-to-exploring" },
    { label: "Meaningful Emotional Bond", value: "emotional-bond" },
    { label: "Travel or Activity Partner", value: "travel-activity" },
    {
      label: "Professional or Networking Connection",
      value: "professional-networking",
    },
    { label: "Exploring Identity & Sexuality", value: "identity-sexuality" },
  ],
  bloodTypeOptions: [
    { label: "A+", value: "a+" },
    { label: "A-", value: "a-" },
    { label: "B+", value: "b+" },
    { label: "B-", value: "b-" },
    { label: "AB+", value: "ab+" },
    { label: "AB-", value: "ab-" },
    { label: "O+", value: "o+" },
    { label: "O-", value: "o-" },
  ],
  interestOptions: [
    { label: "Art & Culture", value: "art-culture" },
    { label: "Music", value: "music" },
    { label: "Travel & Adventure", value: "travel" },
    { label: "Reading & Literature", value: "reading" },
    { label: "Sports & Fitness", value: "sports-fitness" },
    { label: "Cooking & Food", value: "cooking" },
    { label: "Technology & Innovation", value: "technology" },
    { label: "Movies & Entertainment", value: "movies" },
    { label: "Photography & Design", value: "photography" },
    { label: "Gaming", value: "gaming" },
    { label: "Science & Nature", value: "science" },
    { label: "Volunteering & Community", value: "volunteering" },
    { label: "Mindfulness & Spirituality", value: "spirituality" },
  ],
  dietOptions: [
    { label: "Vegetarian", value: "vegetarian" },
    { label: "Vegan", value: "vegan" },
    { label: "Pescatarian", value: "pescatarian" },
    { label: "No Restrictions", value: "no-restrictions" },
    { label: "Halal", value: "halal" },
    { label: "Kosher", value: "kosher" },
    { label: "Gluten-Free", value: "gluten-free" },
  ],
  zodiacOptions: [
    { label: "Aries", value: "aries" },
    { label: "Taurus", value: "taurus" },
    { label: "Gemini", value: "gemini" },
    { label: "Cancer", value: "cancer" },
    { label: "Leo", value: "leo" },
    { label: "Virgo", value: "virgo" },
    { label: "Libra", value: "libra" },
    { label: "Scorpio", value: "scorpio" },
    { label: "Sagittarius", value: "sagittarius" },
    { label: "Capricorn", value: "capricorn" },
    { label: "Aquarius", value: "aquarius" },
    { label: "Pisces", value: "pisces" },
  ],
  drinkingOptions: [
    { label: "Never", value: "never" },
    { label: "Occasionally", value: "occasionally" },
    { label: "Socially", value: "socially" },
    { label: "Regularly", value: "regularly" },
    { label: "Prefer Not to Say", value: "prefer-not-to-say" },
  ],
  smokingOptions: [
    { label: "Never", value: "never" },
    { label: "Occasionally", value: "occasionally" },
    { label: "Socially", value: "socially" },
    { label: "Regularly", value: "regularly" },
    { label: "Prefer Not to Say", value: "prefer-not-to-say" },
  ],
  petOptions: [
    { label: "Love Pets", value: "love-pets" },
    { label: "Have Pets", value: "have-pets" },
    { label: "No Pets Right Now", value: "no-pets" },
    { label: "Allergic to Pets", value: "allergic" },
    { label: "Prefer Not to Say", value: "prefer-not-to-say" },
  ],
  maritalStatusOptions: [
    { label: "Single", value: "single" },
    { label: "Divorced", value: "divorced" },
    { label: "Separated", value: "separated" },
    { label: "Widowed", value: "widowed" },
    { label: "In a Relationship", value: "in-relationship" },
  ],
  personalityTypeOptions: [
    { label: "INTJ", value: "intj" },
    { label: "INTP", value: "intp" },
    { label: "ENTJ", value: "entj" },
    { label: "ENTP", value: "entp" },
    { label: "INFJ", value: "infj" },
    { label: "INFP", value: "infp" },
    { label: "ENFJ", value: "enfj" },
    { label: "ENFP", value: "enfp" },
    { label: "ISTJ", value: "istj" },
    { label: "ISFJ", value: "isfj" },
    { label: "ESTJ", value: "estj" },
    { label: "ESFJ", value: "esfj" },
    { label: "ISTP", value: "istp" },
    { label: "ISFP", value: "isfp" },
    { label: "ESTP", value: "estp" },
    { label: "ESFP", value: "esfp" },
  ],
  religionOptions: [
    { label: "Christian", value: "christian" },
    { label: "Muslim", value: "muslim" },
    { label: "Hindu", value: "hindu" },
    { label: "Buddhist", value: "buddhist" },
    { label: "Jewish", value: "jewish" },
    { label: "Spiritual, Not Religious", value: "spiritual" },
    { label: "Agnostic / Atheist", value: "agnostic-atheist" },
    { label: "Other", value: "other" },
    { label: "Prefer Not to Say", value: "prefer-not-to-say" },
  ],
  relationshipTypeOptions: [
    { label: "Monogamous", value: "monogamy" },
    { label: "Open Relationship", value: "open-relationship" },
    { label: "Ethical Non-Monogamy", value: "ethical-non-monogamy" },
    { label: "Exploring What Feels Right", value: "exploring" },
  ],
  visibilityOptions: [
    { label: "Public", value: "public" },
    { label: "Unlock (Friends)", value: "unlocked" },
    { label: "Private", value: "private" },
  ],
};

const normalizeOptionList = (list = []) => {
  if (!Array.isArray(list)) {
    throw new Error("Each option field must be an array");
  }

  const seen = new Set();
  const normalized = [];

  for (const entry of list) {
    const label = String(entry?.label || "").trim();
    const value = String(entry?.value || "").trim();

    if (!label || !value) {
      throw new Error("Each option must contain non-empty label and value");
    }

    if (seen.has(value)) continue;
    seen.add(value);
    normalized.push({ label, value });
  }

  return normalized;
};

export const normalizeOptionsPayload = (payload = {}) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("options payload must be an object");
  }

  const normalized = {};
  for (const [key, list] of Object.entries(payload)) {
    normalized[key] = normalizeOptionList(list);
  }

  return normalized;
};

export const getOrCreateGlobalOptions = async () => {
  let doc = await AppOptions.findOne({ key: "global" }).lean();
  if (doc) {
    const nextOptions = { ...DEFAULT_OPTIONS, ...(doc.options || {}) };
    if (JSON.stringify(nextOptions) !== JSON.stringify(doc.options || {})) {
      const patched = await AppOptions.findOneAndUpdate(
        { key: "global" },
        { $set: { options: nextOptions } },
        { returnDocument: "after" },
      ).lean();
      return patched;
    }
    return doc;
  }

  await AppOptions.create({
    key: "global",
    options: DEFAULT_OPTIONS,
    version: new Date().toISOString(),
  });

  return AppOptions.findOne({ key: "global" }).lean();
};

export const updateGlobalOptions = async ({ optionsPatch, userId }) => {
  const existing = await getOrCreateGlobalOptions();
  const normalizedPatch = normalizeOptionsPayload(optionsPatch);

  const mergedOptions = {
    ...existing.options,
    ...normalizedPatch,
  };

  const nextVersion = new Date().toISOString();

  const updated = await AppOptions.findOneAndUpdate(
    { key: "global" },
    {
      $set: {
        options: mergedOptions,
        version: nextVersion,
        lastUpdatedBy: userId || null,
      },
    },
    { returnDocument: "after" },
  ).lean();

  return updated;
};

