import {
  getNvidiaApiKey,
  getNvidiaModel,
  requestNvidiaChatCompletion,
} from "./matchNoteProvider.service.js";
import { getId } from "../utils/matchIds.js";
import { logError } from "../utils/logError.js";
import {
  MATCH_NOTE_PROVIDER_FALLBACK,
  MATCH_NOTE_PROVIDER_NVIDIA,
  MATCH_NOTE_STRATEGY_FALLBACK,
  MATCH_NOTE_STRATEGY_NVIDIA,
  MATCH_NOTE_STRATEGY_NVIDIA_PAIR,
  buildFallbackSentence,
  buildMatchNoteMeta,
  buildNvidiaMessages,
  buildNvidiaPairMessages,
  extractResponseText,
  getDisplayName,
  normalizeGeneratedSentence,
  parseJsonObject,
  summarizeMatchingNote,
} from "./matchNoteContent.service.js";

const MATCH_NOTE_LOG_PREFIX = "[matchnote]";
const getAxiosErrorReason = (error) => {
  const status = Number(error?.response?.status);
  if (Number.isInteger(status) && status >= 100 && status <= 599) {
    return `http_${status}`;
  }

  return typeof error?.code === "string" && /^[A-Z0-9_]+$/.test(error.code)
    ? error.code.toLowerCase()
    : "provider_request_failed";
};

const requestNvidia = async ({ messages, timeoutMs, operation }) => {
  const apiKey = getNvidiaApiKey();
  if (!apiKey) return { errorReason: "missing_nvidia_api_key" };

  try {
    const response = await requestNvidiaChatCompletion(apiKey, messages, timeoutMs);
    return { data: response.data };
  } catch (error) {
    logError(`${MATCH_NOTE_LOG_PREFIX} ${operation}_failed`, error);
    return { errorReason: getAxiosErrorReason(error) };
  }
};

const callNvidiaMatchNote = async ({
  viewerName,
  suggestedPersonName,
  matchingNote,
  noteSummary,
  fallbackSentence,
  timeoutMs,
}) => {
  const { data, errorReason } = await requestNvidia({
    messages: buildNvidiaMessages({
      viewerName,
      suggestedPersonName,
      matchingNote,
      noteSummary,
    }),
    timeoutMs,
    operation: "nvidia_generation",
  });
  if (errorReason) {
    return {
      sentence: fallbackSentence,
      meta: buildMatchNoteMeta({
        usedFallback: true,
        reasons: [errorReason],
        attemptedProvider: MATCH_NOTE_PROVIDER_NVIDIA,
        ...(errorReason !== "missing_nvidia_api_key" && { model: getNvidiaModel() }),
      }),
    };
  }

  const rawSentence = extractResponseText(data);
  if (!rawSentence) {
    return {
      sentence: fallbackSentence,
      meta: buildMatchNoteMeta({
        usedFallback: true,
        reasons: ["empty_nvidia_response"],
        attemptedProvider: MATCH_NOTE_PROVIDER_NVIDIA,
        model: getNvidiaModel(),
      }),
    };
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
};

const generateSentenceForPair = ({
  viewer,
  otherUser,
  matchingNote,
  noteSummary = summarizeMatchingNote(matchingNote),
  timeoutMs,
}) => {
  const viewerName = getDisplayName(viewer, "User");
  const suggestedPersonName = getDisplayName(otherUser);
  const fallbackSentence = buildFallbackSentence({
    suggestedPersonName,
    noteSummary,
  });

  return callNvidiaMatchNote({
    viewerName,
    suggestedPersonName,
    matchingNote,
    noteSummary,
    fallbackSentence,
    timeoutMs,
  });
};

const buildFallbackNotesByUser = ({ seeker, candidate, noteSummary }) => {
  const seekerId = getId(seeker);
  const candidateId = getId(candidate);
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
  const { data, errorReason } = await requestNvidia({
    messages: buildNvidiaPairMessages({
      seekerName,
      candidateName,
      matchingNote,
      noteSummary,
    }),
    operation: "nvidia_pair_generation",
  });
  if (errorReason) {
    return {
      seekerSentence: fallbackNotes.seekerSentence,
      candidateSentence: fallbackNotes.candidateSentence,
      meta: buildMatchNoteMeta({
        usedFallback: true,
        reasons: [errorReason],
        attemptedProvider: MATCH_NOTE_PROVIDER_NVIDIA,
        ...(errorReason !== "missing_nvidia_api_key" && { model: getNvidiaModel() }),
      }),
    };
  }

  const parsed = parseJsonObject(extractResponseText(data));
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
};

export const generateMatchNote = async ({
  viewer,
  otherUser,
  matchingNote,
  timeoutMs,
}) => {
  const result = await generateSentenceForPair({
    viewer,
    otherUser,
    matchingNote,
    timeoutMs,
  });

  return {
    sentence: result.sentence,
    meta: {
      ...result.meta,
      viewerId: getId(viewer) || null,
      otherUserId: getId(otherUser) || null,
    },
  };
};

export const generateMatchNotesByUser = async ({
  seeker,
  candidate,
  matchingNote,
}) => {
  const noteSummary = summarizeMatchingNote(matchingNote);
  const seekerId = getId(seeker);
  const candidateId = getId(candidate);

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

  const notesByUser = fallbackNotes.notesByUser;
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
    return matchingNote;
  }

  let seeker = null;
  let candidate = null;
  try {
    const users = (await loadUsers({ seekerId, candidateId })) || [];
    for (const user of users) {
      const uid = getId(user);
      if (!uid) continue;
      if (uid === getId(seekerId)) seeker = user;
      if (uid === getId(candidateId)) candidate = user;
    }
  } catch (error) {
    logError(`${MATCH_NOTE_LOG_PREFIX} user_load_failed`, error);
  }

  const matchNoteResult = await generateMatchNotesByUser({
    seeker,
    candidate,
    matchingNote,
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
