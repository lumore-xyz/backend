import axios from "axios";

const MATCH_NOTE_LOG_PREFIX = "[matchnote]";

const toUserIdString = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value.toString) return value.toString();
  return String(value);
};

const logEnrichedBuild = ({
  seekerId,
  candidateId,
  stage,
  details = {},
}) => {
  console.info(`${MATCH_NOTE_LOG_PREFIX} ${stage}`, {
    seekerId: toUserIdString(seekerId),
    candidateId: toUserIdString(candidateId),
    ...details,
  });
};
const MATCH_NOTE_PROVIDER_FALLBACK = "fallback";
const MATCH_NOTE_PROVIDER_NVIDIA = "nvidia";
const MATCH_NOTE_STRATEGY_FALLBACK = "deterministic_template";
const MATCH_NOTE_STRATEGY_NVIDIA = "nvidia_chat_completion";
const MATCH_NOTE_STRATEGY_NVIDIA_PAIR = "nvidia_chat_completion_pair_json";
const NVIDIA_CHAT_COMPLETIONS_URL =
  "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_DEFAULT_MODEL = "google/gemma-4-31b-it";
const NVIDIA_DEFAULT_TIMEOUT_MS = 15000;
const NVIDIA_DEFAULT_MAX_TOKENS = 120;
const DEFAULT_PERSON_NAME = "this person";
const DEFAULT_ALIGNMENT_REASON = "your preferences align strongly";
const MAX_SHARED_INTERESTS = 2;
const MAX_SHARED_GOALS = 1;
const MAX_SHARED_LANGUAGES = 1;

const toTrimmedString = (value) => String(value ?? "").trim();

const toReadablePhrase = (value) =>
  toTrimmedString(value).replace(/[-_]+/g, " ");

const normalizeStringList = (value) =>
  Array.isArray(value) ? value.map(toTrimmedString).filter(Boolean) : [];

const getUserId = (user) => toTrimmedString(user?._id);

const getDisplayName = (user, fallback = DEFAULT_PERSON_NAME) =>
  toTrimmedString(user?.nickname) ||
  toTrimmedString(user?.username) ||
  fallback;

const toPositiveNumber = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0;
};

const toBooleanFlag = (value) =>
  ["1", "true", "yes", "on"].includes(toTrimmedString(value).toLowerCase());

const getNvidiaApiKey = () => toTrimmedString(process.env.NVIDIA_API_KEY);

const getNvidiaModel = () =>
  toTrimmedString(process.env.NVIDIA_MATCH_NOTE_MODEL) || NVIDIA_DEFAULT_MODEL;

const getNvidiaTimeoutMs = () => {
  const timeoutMs = Number(process.env.NVIDIA_MATCH_NOTE_TIMEOUT_MS);
  return Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : NVIDIA_DEFAULT_TIMEOUT_MS;
};

const isNvidiaThinkingEnabled = () =>
  toBooleanFlag(process.env.NVIDIA_MATCH_NOTE_ENABLE_THINKING);

const finalizeSentence = (sentence) =>
  toTrimmedString(sentence)
    .replace(/\s+/g, " ")
    .replace(/["`]/g, "")
    .replace(/[.!?]+$/g, "") + ".";

const stripThinkingText = (value) =>
  toTrimmedString(value)
    .replace(/<think>[\s\S]*?<\/think>/gi, " ")
    .trim();

const stripMarkdownCodeFence = (value) =>
  stripThinkingText(value)
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

const collectReasonFragments = ({
  sharedGoals,
  sharedInterests,
  sharedLanguages,
  matchedAnswerCount,
}) => {
  const reasonFragments = [];

  if (sharedGoals.length) {
    reasonFragments.push(`you share the same goal ${sharedGoals[0]}`);
  }

  if (sharedInterests.length) {
    reasonFragments.push(`you both enjoy ${sharedInterests.join(" and ")}`);
  }

  if (sharedLanguages.length) {
    reasonFragments.push(`you can connect in ${sharedLanguages[0]}`);
  }

  if (matchedAnswerCount > 0) {
    reasonFragments.push(
      `you matched on ${matchedAnswerCount} This-or-That answers`,
    );
  }

  return reasonFragments;
};

const summarizeMatchingNote = (matchingNote = {}) => {
  const sharedGoals = normalizeStringList(matchingNote?.common?.goals)
    .map(toReadablePhrase)
    .slice(0, MAX_SHARED_GOALS);
  const sharedInterests = normalizeStringList(matchingNote?.common?.interests)
    .map(toReadablePhrase)
    .slice(0, MAX_SHARED_INTERESTS);
  const sharedLanguages = normalizeStringList(matchingNote?.common?.languages)
    .map(toReadablePhrase)
    .slice(0, MAX_SHARED_LANGUAGES);
  const matchedAnswerCount = toPositiveNumber(
    matchingNote?.thisOrThat?.matchedAnswers,
  );
  const candidatePoolSize = toPositiveNumber(matchingNote?.candidatePoolSize);
  const reasonFragments = collectReasonFragments({
    sharedGoals,
    sharedInterests,
    sharedLanguages,
    matchedAnswerCount,
  });

  return {
    candidatePoolSize,
    poolMode: toTrimmedString(matchingNote?.poolMode) || null,
    primaryReason: reasonFragments[0] || DEFAULT_ALIGNMENT_REASON,
    sharedGoals,
    sharedInterests,
    sharedLanguages,
    matchedAnswerCount,
  };
};

const buildPoolContext = (candidatePoolSize) =>
  candidatePoolSize > 1
    ? `out of ${candidatePoolSize} available options`
    : "from the current pool";

const buildFriendPitchReason = (noteSummary) => {
  if (noteSummary.sharedGoals.length) {
    return "you're both looking for the same kind of connection, so this could actually go somewhere";
  }

  if (noteSummary.sharedInterests.length) {
    return `they're into ${noteSummary.sharedInterests.join(" and ")}, so the conversation already has somewhere fun to go`;
  }

  if (noteSummary.sharedLanguages.length) {
    return `they speak ${noteSummary.sharedLanguages[0]}, so talking should feel easy right away`;
  }

  if (noteSummary.matchedAnswerCount > 0) {
    return `you matched on ${noteSummary.matchedAnswerCount} This-or-That answers, which is a pretty good sign you'll click`;
  }

  return "they feel like your kind of person";
};

const buildFriendPitchTail = (candidatePoolSize) =>
  candidatePoolSize > 1
    ? ` and they stood out from ${candidatePoolSize} options`
    : "";

const buildFallbackSentence = ({ suggestedPersonName, noteSummary }) =>
  finalizeSentence(
    `You should talk to ${suggestedPersonName} because ${buildFriendPitchReason(noteSummary)}${buildFriendPitchTail(noteSummary.candidatePoolSize)}`,
  );

const buildMatchNoteMeta = (overrides = {}) => ({
  provider: MATCH_NOTE_PROVIDER_FALLBACK,
  model: null,
  usedFallback: false,
  strategy: MATCH_NOTE_STRATEGY_FALLBACK,
  reasons: [],
  ...overrides,
});

const buildPromptPayload = ({ matchingNote = {}, noteSummary }) => ({
  poolMode: noteSummary.poolMode,
  candidatePoolSize: noteSummary.candidatePoolSize,
  primaryReason: noteSummary.primaryReason,
  sharedGoals: noteSummary.sharedGoals,
  sharedInterests: noteSummary.sharedInterests,
  sharedLanguages: noteSummary.sharedLanguages,
  matchedAnswerCount: noteSummary.matchedAnswerCount,
  totalScore: matchingNote?.totalScore,
  rankingContext: matchingNote?.rankingContext,
  components: matchingNote?.components,
  common: matchingNote?.common,
  thisOrThat: matchingNote?.thisOrThat,
  reasons: matchingNote?.reasons,
  distanceKm: matchingNote?.distanceKm ?? null,
  isRecentRematch: Boolean(matchingNote?.isRecentRematch),
});

const buildNvidiaMessages = ({
  viewerName,
  suggestedPersonName,
  matchingNote,
  noteSummary,
}) => [
  {
    role: "system",
    content: [
      "You write short dating app match-opening notes that sound like a friend pitching their friend.",
      `Return exactly one sentence starting with "You should talk to ${suggestedPersonName} because ...".`,
      "Use second-person tone.",
      "Use only the provided facts.",
      "Sound warm, personal, and lightly persuasive, like a friend nudging a friend toward someone promising.",
      "Do not sound like an algorithm, score summary, or product tooltip.",
      "Do not output JSON, markdown, emoji, or extra commentary.",
      "Keep it warm, natural, slightly playful, and under 28 words.",
    ].join(" "),
  },
  {
    role: "user",
    content: [
      `Viewer name: ${viewerName}`,
      `Suggested person name: ${suggestedPersonName}`,
      `Match data JSON: ${JSON.stringify(buildPromptPayload({ matchingNote, noteSummary }))}`,
    ].join("\n"),
  },
];

const buildNvidiaPairMessages = ({
  seekerName,
  candidateName,
  matchingNote,
  noteSummary,
}) => [
  {
    role: "system",
    content: [
      "You write short dating app match-opening notes that sound like a friend pitching their friend.",
      "Return only valid JSON with exactly two keys: seekerNote and candidateNote.",
      `seekerNote must be exactly one sentence starting with "You should talk to ${candidateName} because ...".`,
      `candidateNote must be exactly one sentence starting with "You should talk to ${seekerName} because ...".`,
      "Use second-person tone.",
      "Use only the provided facts.",
      "Make each sentence sound like a warm friend recommendation, not an app-generated explanation.",
      "Do not mention scores, rankings, matching algorithms, or anything that sounds robotic.",
      "Do not output markdown, code fences, emoji, or commentary outside the JSON object.",
      "Keep each sentence warm, natural, slightly playful, and under 50 words.",
    ].join(" "),
  },
  {
    role: "user",
    content: [
      `Seeker name: ${seekerName}`,
      `Candidate name: ${candidateName}`,
      `Match data JSON: ${JSON.stringify(buildPromptPayload({ matchingNote, noteSummary }))}`,
    ].join("\n"),
  },
];

const extractResponseText = (responseData = {}) => {
  const content = responseData?.choices?.[0]?.message?.content;

  if (Array.isArray(content)) {
    return content
      .map((item) =>
        typeof item === "string" ? item : toTrimmedString(item?.text),
      )
      .join(" ")
      .trim();
  }

  if (typeof content === "string") {
    return content;
  }

  if (typeof responseData?.choices?.[0]?.text === "string") {
    return responseData.choices[0].text;
  }

  return "";
};

const parseJsonObject = (value) => {
  const cleaned = stripMarkdownCodeFence(value);
  if (!cleaned) return null;

  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBraceIndex = cleaned.indexOf("{");
    const lastBraceIndex = cleaned.lastIndexOf("}");

    if (firstBraceIndex < 0 || lastBraceIndex <= firstBraceIndex) {
      return null;
    }

    try {
      return JSON.parse(cleaned.slice(firstBraceIndex, lastBraceIndex + 1));
    } catch {
      return null;
    }
  }
};

const normalizeGeneratedSentence = ({
  rawSentence,
  suggestedPersonName,
  fallbackSentence,
}) => {
  const cleaned = finalizeSentence(stripThinkingText(rawSentence));
  const lowerSentence = cleaned.toLowerCase();
  const lowerName = suggestedPersonName.toLowerCase();

  if (
    lowerSentence.startsWith("you should talk to ") &&
    lowerSentence.includes(" because ") &&
    lowerSentence.includes(lowerName)
  ) {
    return cleaned;
  }

  return fallbackSentence;
};

const getAxiosErrorReason = (error) => {
  const remoteMessage =
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.response?.data?.detail;

  return toTrimmedString(remoteMessage || error?.message) || "unknown_error";
};

const logMatchNoteGeneration = ({ seekerId, candidateId, noteSummary }) => {
  console.info(`${MATCH_NOTE_LOG_PREFIX} generating notes`, {
    provider: getNvidiaApiKey()
      ? MATCH_NOTE_PROVIDER_NVIDIA
      : MATCH_NOTE_PROVIDER_FALLBACK,
    seekerId: seekerId || null,
    candidateId: candidateId || null,
    poolMode: noteSummary.poolMode,
    candidatePoolSize: noteSummary.candidatePoolSize,
  });
};

const callNvidiaMatchNote = async ({
  viewerName,
  suggestedPersonName,
  matchingNote,
  noteSummary,
  fallbackSentence,
}) => {
  const apiKey = getNvidiaApiKey();

  if (!apiKey) {
    return {
      sentence: fallbackSentence,
      meta: buildMatchNoteMeta({
        usedFallback: true,
        reasons: ["missing_nvidia_api_key"],
        attemptedProvider: MATCH_NOTE_PROVIDER_NVIDIA,
      }),
    };
  }

  try {
    const response = await axios.post(
      NVIDIA_CHAT_COMPLETIONS_URL,
      {
        model: getNvidiaModel(),
        messages: buildNvidiaMessages({
          viewerName,
          suggestedPersonName,
          matchingNote,
          noteSummary,
        }),
        max_tokens: NVIDIA_DEFAULT_MAX_TOKENS,
        temperature: 1,
        top_p: 0.95,
        stream: false,
        chat_template_kwargs: {
          enable_thinking: isNvidiaThinkingEnabled(),
        },
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        responseType: "json",
        timeout: getNvidiaTimeoutMs(),
      },
    );

    const rawSentence = extractResponseText(response.data);
    if (!rawSentence) {
      throw new Error("empty_nvidia_response");
    }

    const sentence = normalizeGeneratedSentence({
      rawSentence,
      suggestedPersonName,
      fallbackSentence,
    });
    const usedFallback = sentence === fallbackSentence;

    return {
      sentence,
      meta: buildMatchNoteMeta({
        provider: usedFallback
          ? MATCH_NOTE_PROVIDER_FALLBACK
          : MATCH_NOTE_PROVIDER_NVIDIA,
        model: getNvidiaModel(),
        usedFallback,
        strategy: usedFallback
          ? MATCH_NOTE_STRATEGY_FALLBACK
          : MATCH_NOTE_STRATEGY_NVIDIA,
        reasons: usedFallback ? ["invalid_nvidia_output_shape"] : [],
        attemptedProvider: MATCH_NOTE_PROVIDER_NVIDIA,
      }),
    };
  } catch (error) {
    const reason = getAxiosErrorReason(error);
    console.error(`${MATCH_NOTE_LOG_PREFIX} nvidia_generation_failed`, {
      model: getNvidiaModel(),
      reason,
    });

    return {
      sentence: fallbackSentence,
      meta: buildMatchNoteMeta({
        usedFallback: true,
        reasons: [reason],
        attemptedProvider: MATCH_NOTE_PROVIDER_NVIDIA,
        model: getNvidiaModel(),
      }),
    };
  }
};

const generateSentenceForPair = async ({
  viewer,
  otherUser,
  matchingNote,
  noteSummary = summarizeMatchingNote(matchingNote),
}) => {
  const viewerName = getDisplayName(viewer, "User");
  const suggestedPersonName = getDisplayName(otherUser);
  const fallbackSentence = buildFallbackSentence({
    suggestedPersonName,
    noteSummary,
  });

  return await callNvidiaMatchNote({
    viewerName,
    suggestedPersonName,
    matchingNote,
    noteSummary,
    fallbackSentence,
  });
};

const buildFallbackNotesByUser = ({ seeker, candidate, noteSummary }) => {
  const seekerId = getUserId(seeker);
  const candidateId = getUserId(candidate);
  const seekerName = getDisplayName(seeker);
  const candidateName = getDisplayName(candidate);
  const seekerSentence = buildFallbackSentence({
    suggestedPersonName: candidateName,
    noteSummary,
  });
  const candidateSentence = buildFallbackSentence({
    suggestedPersonName: seekerName,
    noteSummary,
  });
  const notesByUser = {};

  if (seekerId) {
    notesByUser[seekerId] = seekerSentence;
  }
  if (candidateId) {
    notesByUser[candidateId] = candidateSentence;
  }

  return {
    seekerId,
    candidateId,
    seekerName,
    candidateName,
    seekerSentence,
    candidateSentence,
    notesByUser,
  };
};

const callNvidiaMatchNotesPair = async ({
  seekerName,
  candidateName,
  matchingNote,
  noteSummary,
  fallbackNotes,
}) => {
  const apiKey = getNvidiaApiKey();

  if (!apiKey) {
    return {
      seekerSentence: fallbackNotes.seekerSentence,
      candidateSentence: fallbackNotes.candidateSentence,
      meta: buildMatchNoteMeta({
        usedFallback: true,
        reasons: ["missing_nvidia_api_key"],
        attemptedProvider: MATCH_NOTE_PROVIDER_NVIDIA,
      }),
    };
  }

  try {
    const response = await axios.post(
      NVIDIA_CHAT_COMPLETIONS_URL,
      {
        model: getNvidiaModel(),
        messages: buildNvidiaPairMessages({
          seekerName,
          candidateName,
          matchingNote,
          noteSummary,
        }),
        max_tokens: NVIDIA_DEFAULT_MAX_TOKENS,
        temperature: 1,
        top_p: 0.95,
        stream: false,
        chat_template_kwargs: {
          enable_thinking: isNvidiaThinkingEnabled(),
        },
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        responseType: "json",
        timeout: getNvidiaTimeoutMs(),
      },
    );

    const rawText = extractResponseText(response.data);
    const parsed = parseJsonObject(rawText);

    if (!parsed || typeof parsed !== "object") {
      return {
        seekerSentence: fallbackNotes.seekerSentence,
        candidateSentence: fallbackNotes.candidateSentence,
        meta: buildMatchNoteMeta({
          usedFallback: true,
          reasons: ["invalid_nvidia_json_response"],
          attemptedProvider: MATCH_NOTE_PROVIDER_NVIDIA,
          model: getNvidiaModel(),
        }),
      };
    }

    const seekerSentence = normalizeGeneratedSentence({
      rawSentence: parsed.seekerNote,
      suggestedPersonName: candidateName,
      fallbackSentence: fallbackNotes.seekerSentence,
    });
    const candidateSentence = normalizeGeneratedSentence({
      rawSentence: parsed.candidateNote,
      suggestedPersonName: seekerName,
      fallbackSentence: fallbackNotes.candidateSentence,
    });
    const usedFallback =
      seekerSentence === fallbackNotes.seekerSentence ||
      candidateSentence === fallbackNotes.candidateSentence;

    return {
      seekerSentence,
      candidateSentence,
      meta: buildMatchNoteMeta({
        provider: usedFallback
          ? MATCH_NOTE_PROVIDER_FALLBACK
          : MATCH_NOTE_PROVIDER_NVIDIA,
        model: getNvidiaModel(),
        usedFallback,
        strategy: usedFallback
          ? MATCH_NOTE_STRATEGY_FALLBACK
          : MATCH_NOTE_STRATEGY_NVIDIA_PAIR,
        reasons: usedFallback ? ["invalid_nvidia_output_shape"] : [],
        attemptedProvider: MATCH_NOTE_PROVIDER_NVIDIA,
      }),
    };
  } catch (error) {
    const reason = getAxiosErrorReason(error);
    console.error(`${MATCH_NOTE_LOG_PREFIX} nvidia_pair_generation_failed`, {
      model: getNvidiaModel(),
      reason,
    });

    return {
      seekerSentence: fallbackNotes.seekerSentence,
      candidateSentence: fallbackNotes.candidateSentence,
      meta: buildMatchNoteMeta({
        usedFallback: true,
        reasons: [reason],
        attemptedProvider: MATCH_NOTE_PROVIDER_NVIDIA,
        model: getNvidiaModel(),
      }),
    };
  }
};

export const generateMatchNote = async ({
  viewer,
  otherUser,
  matchingNote,
}) => {
  const result = await generateSentenceForPair({
    viewer,
    otherUser,
    matchingNote,
  });

  return {
    sentence: result.sentence,
    meta: {
      ...result.meta,
      viewerId: getUserId(viewer) || null,
      otherUserId: getUserId(otherUser) || null,
    },
  };
};

export const generateMatchNotesByUser = async ({
  seeker,
  candidate,
  matchingNote,
}) => {
  const noteSummary = summarizeMatchingNote(matchingNote);
  const seekerId = getUserId(seeker);
  const candidateId = getUserId(candidate);

  logMatchNoteGeneration({
    seekerId,
    candidateId,
    noteSummary,
  });

  const fallbackNotes = buildFallbackNotesByUser({
    seeker,
    candidate,
    noteSummary,
  });
  const pairResult = await callNvidiaMatchNotesPair({
    seekerName: fallbackNotes.seekerName,
    candidateName: fallbackNotes.candidateName,
    matchingNote,
    noteSummary,
    fallbackNotes,
  });

  const notesByUser = { ...fallbackNotes.notesByUser };
  if (seekerId) {
    notesByUser[seekerId] = pairResult.seekerSentence;
  }
  if (candidateId) {
    notesByUser[candidateId] = pairResult.candidateSentence;
  }

  return {
    notesByUser,
    primarySentence: seekerId
      ? notesByUser[seekerId]
      : pairResult.seekerSentence,
    meta: buildMatchNoteMeta({
      provider: pairResult.meta?.provider || MATCH_NOTE_PROVIDER_FALLBACK,
      model: pairResult.meta?.model || null,
      usedFallback: Boolean(pairResult.meta?.usedFallback),
      strategy: pairResult.meta?.strategy || MATCH_NOTE_STRATEGY_FALLBACK,
      reasons: pairResult.meta?.reasons || [],
      attemptedProvider: pairResult.meta?.attemptedProvider || null,
      seekerId: seekerId || null,
      candidateId: candidateId || null,
    }),
  };
};

/**
 * Loads both users and runs the AI pair generation. Returns a matchingNote
 * envelope with `oneSentenceNote` (primary, seeker POV), `notesByUser` (per
 * user), and `aiSummary` (provider/model/reasons metadata). If the AI cannot
 * generate a sentence, falls back to the deterministic template so the
 * chat room always has something useful to show.
 *
 * Both the explore and the community matching flows call this so the AI
 * pipeline is shared and the surface area on mobile stays consistent.
 */
export const buildMatchNote = async ({
  seekerId,
  candidateId,
  matchingNote,
  loadUsers,
}) => {
  if (!matchingNote || typeof matchingNote !== "object") {
    logEnrichedBuild({
      seekerId,
      candidateId,
      stage: "build_match_note_skipped",
      details: { reason: "missing_matching_note" },
    });
    return matchingNote;
  }

  logEnrichedBuild({
    seekerId,
    candidateId,
    stage: "build_match_note_start",
    details: { matchingNoteKeys: Object.keys(matchingNote || {}) },
  });

  let seeker = null;
  let candidate = null;
  try {
    const users = (await loadUsers({ seekerId, candidateId })) || [];
    for (const user of users) {
      const uid = user?._id?.toString?.();
      if (!uid) continue;
      if (uid === toUserIdString(seekerId)) seeker = user;
      if (uid === toUserIdString(candidateId)) candidate = user;
    }
    logEnrichedBuild({
      seekerId,
      candidateId,
      stage: "build_match_note_users_loaded",
      details: {
        seekerFound: Boolean(seeker),
        candidateFound: Boolean(candidate),
      },
    });
  } catch (error) {
    console.error(
      `${MATCH_NOTE_LOG_PREFIX} user_load_failed`,
      error?.message || error,
    );
  }

  const matchNoteResult = await generateMatchNotesByUser({
    seeker,
    candidate,
    matchingNote,
  });

  console.info(`${MATCH_NOTE_LOG_PREFIX} generation_result`, {
    seekerId: toUserIdString(seekerId),
    candidateId: toUserIdString(candidateId),
    usedFallback: Boolean(matchNoteResult?.meta?.usedFallback),
    reasons: matchNoteResult?.meta?.reasons || [],
    model: matchNoteResult?.meta?.model || null,
  });

  logEnrichedBuild({
    seekerId,
    candidateId,
    stage: "build_match_note_complete",
    details: {
      hasPrimarySentence: Boolean(matchNoteResult?.primarySentence),
      noteCount: Object.keys(matchNoteResult?.notesByUser || {}).length,
    },
  });

  return {
    ...matchingNote,
    oneSentenceNote: matchNoteResult.primarySentence,
    notesByUser: matchNoteResult.notesByUser,
    aiSummary: {
      ...matchNoteResult.meta,
      generatedAt: new Date().toISOString(),
    },
  };
};
