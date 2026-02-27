import { GoogleGenAI } from "@google/genai";

const DEFAULT_MODEL = [
  "gemma-3-4b-it",
  "gemma-3-1b-it",
  "gemma-3-12b-it",
  "gemma-3-27b-it",
];
const LOG_PREFIX = "[matchnote-ai]";
const ai = new GoogleGenAI({});
const MODEL_LIST_TTL_MS = 10 * 60 * 1000;

let modelRoundRobinIndex = 0;
let modelCache = {
  fetchedAt: 0,
  availableGenerateContentModels: new Set(),
};

const cleanList = (value) =>
  Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

const toId = (value) => String(value?._id || "").trim();

const fallbackSentenceFromNote = ({
  note = {},
  candidateName = "this person",
}) => {
  const sharedInterests = cleanList(note?.common?.interests).slice(0, 2);
  const sharedGoals = cleanList(note?.common?.goals).slice(0, 1);
  const sharedLanguages = cleanList(note?.common?.languages).slice(0, 1);
  const matchedAnswers = Number(note?.thisOrThat?.matchedAnswers || 0);
  const poolSize = Number(note?.candidatePoolSize || 0);

  const reasons = [];
  if (sharedGoals.length)
    reasons.push(`you share the same goal ${sharedGoals[0]}`);
  if (sharedInterests.length)
    reasons.push(`you both enjoy ${sharedInterests.join(" and ")}`);
  if (sharedLanguages.length)
    reasons.push(`you can connect in ${sharedLanguages[0]}`);
  if (matchedAnswers > 0) {
    reasons.push(`you matched on ${matchedAnswers} This-or-That answers`);
  }

  const topReason = reasons[0] || "your preferences align strongly";
  const poolContext =
    poolSize > 1
      ? `out of ${poolSize} available options`
      : "from the current pool";
  return `You should talk to ${candidateName} because ${topReason} and this match ranked best ${poolContext}.`;
};

const enforceOneSentence = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/["`]/g, "")
    .replace(/[.!?]+$/g, "") + ".";

const enforcePersonalizedShape = ({ sentence, otherName, fallback }) => {
  const safeName = String(otherName || "this person").trim();
  const normalized = enforceOneSentence(sentence);
  const lower = normalized.toLowerCase();
  const hasPrefix = lower.startsWith("you should talk to ");
  const hasBecause = lower.includes(" because ");
  const hasName = safeName ? lower.includes(safeName.toLowerCase()) : true;

  if (hasPrefix && hasBecause && hasName) return normalized;
  return fallback;
};

const parseJsonSlice = (rawText) => {
  const text = String(rawText || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const jsonSlice = text.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(jsonSlice);
      } catch {
        return null;
      }
    }
    return null;
  }
};

const normalizeModelName = (value) =>
  String(value || "")
    .trim()
    .replace(/^models\//i, "")
    .toLowerCase();

const normalizeModelCandidates = (value) => {
  if (Array.isArray(value)) {
    return value.map(normalizeModelName).filter(Boolean);
  }

  const raw = String(value || "").trim();
  if (!raw) return [];

  if (raw.startsWith("[") && raw.endsWith("]")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(normalizeModelName).filter(Boolean);
      }
    } catch {
      // Fall through to CSV parsing.
    }
  }

  return raw
    .split(",")
    .map((item) => normalizeModelName(item))
    .filter(Boolean);
};

const getConfiguredModelCandidates = () => {
  const fromEnv =
    process.env.GEMINI_MATCH_MODELS ||
    process.env.GEMINI_MATCH_MODEL ||
    process.env.GEMINI_MODEL ||
    DEFAULT_MODEL;

  const normalized = Array.from(new Set(normalizeModelCandidates(fromEnv)));
  return normalized.length
    ? normalized
    : Array.from(new Set(normalizeModelCandidates(DEFAULT_MODEL)));
};

const isRateLimitError = (error) => {
  const text = String(error?.message || "").toLowerCase();
  return (
    text.includes("429") ||
    text.includes("rate") ||
    text.includes("quota") ||
    text.includes("resource_exhausted")
  );
};

const isModelNotFoundError = (error) => {
  const text = String(error?.message || "").toLowerCase();
  return (
    text.includes("404") ||
    text.includes("model not found") ||
    text.includes("unsupported model")
  );
};

const getRoundRobinOrder = (models) => {
  if (!models.length) return [];
  const start = modelRoundRobinIndex % models.length;
  modelRoundRobinIndex = (modelRoundRobinIndex + 1) % models.length;
  return [...models.slice(start), ...models.slice(0, start)];
};

const fetchAvailableGenerateContentModels = async () => {
  const now = Date.now();
  if (
    modelCache.fetchedAt &&
    now - modelCache.fetchedAt < MODEL_LIST_TTL_MS &&
    modelCache.availableGenerateContentModels.size
  ) {
    return modelCache.availableGenerateContentModels;
  }

  const available = new Set();
  const pager = await ai.models.list();
  for await (const model of pager) {
    const methods = Array.isArray(model?.supportedActions)
      ? model.supportedActions
      : Array.isArray(model?.supportedGenerationMethods)
        ? model.supportedGenerationMethods
        : [];

    if (!methods.includes("generateContent")) continue;
    available.add(normalizeModelName(model?.name));
  }

  modelCache = {
    fetchedAt: now,
    availableGenerateContentModels: available,
  };
  return available;
};

const resolveRunnableModels = async () => {
  const configured = getConfiguredModelCandidates();
  let available = null;

  try {
    available = await fetchAvailableGenerateContentModels();
  } catch (error) {
    console.warn(
      `${LOG_PREFIX} could not fetch model list, using configured list`,
      {
        reason: error?.message || "unknown_error",
      },
    );
  }

  if (!available || !available.size) {
    return configured;
  }

  const existing = configured.filter((model) => available.has(model));
  const missing = configured.filter((model) => !available.has(model));
  if (missing.length) {
    console.warn(`${LOG_PREFIX} configured models not found`, { missing });
  }
  return existing.length ? existing : configured;
};

export const listAvailableGeminiModels = async () => {
  const pager = await ai.models.list();
  const rows = [];
  for await (const model of pager) {
    const methods = Array.isArray(model?.supportedActions)
      ? model.supportedActions
      : Array.isArray(model?.supportedGenerationMethods)
        ? model.supportedGenerationMethods
        : [];
    rows.push({
      name: String(model?.name || ""),
      methods,
    });
  }
  return rows;
};

const callGeminiText = async ({ prompt, preface }) => {
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("missing_api_key");
  }

  const runnableModels = await resolveRunnableModels();
  const orderedModels = getRoundRobinOrder(runnableModels);
  const attemptErrors = [];
  const fullPrompt = [preface || "", "", prompt].join("\n");

  for (const model of orderedModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: fullPrompt,
        config: {
          temperature: 0.4,
        },
      });

      const raw = String(response?.text || "").trim();
      if (!raw) {
        throw new Error("empty_response");
      }
      return { raw, model };
    } catch (error) {
      attemptErrors.push({
        model,
        reason: error?.message || "unknown_error",
      });
      if (isRateLimitError(error) || isModelNotFoundError(error)) {
        continue;
      }
      continue;
    }
  }

  throw new Error(
    `all_models_failed:${JSON.stringify(attemptErrors).slice(0, 2000)}`,
  );
};

export const generateGeminiMatchNote = async ({
  viewer,
  otherUser,
  matchingNote,
}) => {
  const otherName = String(
    otherUser?.nickname || otherUser?.username || "this person",
  );
  const fallback = fallbackSentenceFromNote({
    note: matchingNote,
    candidateName: otherName,
  });

  try {
    const payload = {
      poolMode: matchingNote?.poolMode,
      candidatePoolSize: matchingNote?.candidatePoolSize,
      totalScore: matchingNote?.totalScore,
      rankingContext: matchingNote?.rankingContext,
      components: matchingNote?.components,
      common: matchingNote?.common,
      thisOrThat: matchingNote?.thisOrThat,
      reasons: matchingNote?.reasons,
    };

    const prompt = [
      "You write dating app match-opening notes.",
      "Return exactly one sentence and no extra text.",
      'Start with: "You should talk to <name> because ...".',
      "Use second-person tone and only use provided facts.",
      "No JSON, no markdown, no emojis, no hashtags.",
      "",
      `Viewer name: ${String(viewer?.nickname || viewer?.username || "User")}`,
      `Suggested person name: ${String(otherUser?.nickname || otherUser?.username || "User")}`,
      `Match data JSON: ${JSON.stringify(payload)}`,
    ].join("\n");

    const result = await callGeminiText({
      prompt,
      preface: "Output plain text only.",
    });

    return {
      sentence: enforcePersonalizedShape({
        sentence: result.raw,
        otherName,
        fallback,
      }),
      meta: {
        provider: "gemini",
        model: result.model,
        usedFallback: false,
      },
    };
  } catch (error) {
    return {
      sentence: fallback,
      meta: {
        provider: "gemini",
        model: getConfiguredModelCandidates().join(","),
        usedFallback: true,
        reason: error?.message || "unknown_error",
      },
    };
  }
};

export const generateGeminiMatchNotesByUser = async ({
  seeker,
  candidate,
  matchingNote,
}) => {
  const seekerId = toId(seeker);
  const candidateId = toId(candidate);
  const seekerName = String(
    seeker?.nickname || seeker?.username || "this person",
  );
  const candidateName = String(
    candidate?.nickname || candidate?.username || "this person",
  );

  const fallbackForSeeker = fallbackSentenceFromNote({
    note: matchingNote,
    candidateName,
  });
  const fallbackForCandidate = fallbackSentenceFromNote({
    note: matchingNote,
    candidateName: seekerName,
  });

  const fallbackNotesByUser = {};
  if (seekerId) fallbackNotesByUser[seekerId] = fallbackForSeeker;
  if (candidateId) fallbackNotesByUser[candidateId] = fallbackForCandidate;

  console.info(`${LOG_PREFIX} generating notes`, {
    model: getConfiguredModelCandidates(),
    provider: "gemini",
    seekerId: seekerId || null,
    candidateId: candidateId || null,
    poolMode: matchingNote?.poolMode || null,
    candidatePoolSize: Number(matchingNote?.candidatePoolSize || 0),
  });

  try {
    const notesByUser = { ...fallbackNotesByUser };
    const reasons = [];
    const modelsUsed = [];

    const sharedPayload = {
      matchData: {
        poolMode: matchingNote?.poolMode,
        candidatePoolSize: matchingNote?.candidatePoolSize,
        totalScore: matchingNote?.totalScore,
        rankingContext: matchingNote?.rankingContext,
        components: matchingNote?.components,
        common: matchingNote?.common,
        thisOrThat: matchingNote?.thisOrThat,
        reasons: matchingNote?.reasons,
      },
    };

    // First call: note for seeker.
    if (seekerId) {
      const promptForSeeker = [
        "You write dating app match-opening notes.",
        "Return exactly one sentence and no extra text.",
        'Start with: "You should talk to <name> because ...".',
        "Use second-person tone and only use provided facts.",
        "No JSON, no markdown, no emojis, no hashtags.",
        "",
        `Viewer name: ${seekerName}`,
        `Suggested person name: ${candidateName}`,
        `Input JSON: ${JSON.stringify(sharedPayload)}`,
      ].join("\n");
      try {
        const seekerResult = await callGeminiText({
          prompt: promptForSeeker,
          preface: "Output plain text only.",
        });
        modelsUsed.push(seekerResult.model);
        notesByUser[seekerId] = enforcePersonalizedShape({
          sentence: seekerResult.raw,
          otherName: candidateName,
          fallback: fallbackForSeeker,
        });
      } catch (error) {
        reasons.push("missing_seeker_note");
        reasons.push(`seeker_call_failed:${error?.message || "unknown_error"}`);
      }
    }

    // Second call: note for candidate.
    if (candidateId) {
      const promptForCandidate = [
        "You write dating app match-opening notes.",
        "Return exactly one sentence and no extra text.",
        'Start with: "You should talk to <name> because ...".',
        "Use second-person tone and only use provided facts.",
        "No JSON, no markdown, no emojis, no hashtags.",
        "",
        `Viewer name: ${candidateName}`,
        `Suggested person name: ${seekerName}`,
        `Input JSON: ${JSON.stringify(sharedPayload)}`,
      ].join("\n");
      try {
        const candidateResult = await callGeminiText({
          prompt: promptForCandidate,
          preface: "Output plain text only.",
        });
        modelsUsed.push(candidateResult.model);
        notesByUser[candidateId] = enforcePersonalizedShape({
          sentence: candidateResult.raw,
          otherName: seekerName,
          fallback: fallbackForCandidate,
        });
      } catch (error) {
        reasons.push("missing_candidate_note");
        reasons.push(
          `candidate_call_failed:${error?.message || "unknown_error"}`,
        );
      }
    }

    const usedFallback = reasons.length > 0;
    return {
      notesByUser,
      primarySentence: notesByUser[seekerId] || fallbackForSeeker,
      meta: {
        provider: "gemini",
        model: modelsUsed.join(",") || getConfiguredModelCandidates().join(","),
        usedFallback,
        reasons,
      },
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} fallback triggered: request_failed`, {
      error: error?.message || "unknown_error",
      provider: "gemini",
    });
    return {
      notesByUser: fallbackNotesByUser,
      primarySentence: fallbackForSeeker,
      meta: {
        provider: "gemini",
        model: getConfiguredModelCandidates().join(","),
        usedFallback: true,
        reasons: [error?.message || "unknown_error"],
      },
    };
  }
};

// Backward-compatible exports for existing imports/calls.
export const generateOpenRouterMatchNote = generateGeminiMatchNote;
export const generateOpenRouterMatchNotesByUser =
  generateGeminiMatchNotesByUser;
