const MATCH_NOTE_PROVIDER = "fallback";
const MATCH_NOTE_STRATEGY = "deterministic_template";
const MATCH_NOTE_LOG_PREFIX = "[matchnote]";
const DEFAULT_PERSON_NAME = "this person";
const DEFAULT_ALIGNMENT_REASON = "your preferences align strongly";
const MAX_SHARED_INTERESTS = 2;
const MAX_SHARED_GOALS = 1;
const MAX_SHARED_LANGUAGES = 1;

const toTrimmedString = (value) => String(value ?? "").trim();

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

const finalizeSentence = (sentence) =>
  toTrimmedString(sentence)
    .replace(/\s+/g, " ")
    .replace(/["`]/g, "")
    .replace(/[.!?]+$/g, "") + ".";

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
    reasonFragments.push(
      `you both enjoy ${sharedInterests.join(" and ")}`,
    );
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
  const sharedGoals = normalizeStringList(matchingNote?.common?.goals).slice(
    0,
    MAX_SHARED_GOALS,
  );
  const sharedInterests = normalizeStringList(
    matchingNote?.common?.interests,
  ).slice(0, MAX_SHARED_INTERESTS);
  const sharedLanguages = normalizeStringList(
    matchingNote?.common?.languages,
  ).slice(0, MAX_SHARED_LANGUAGES);
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
  };
};

const buildPoolContext = (candidatePoolSize) =>
  candidatePoolSize > 1
    ? `out of ${candidatePoolSize} available options`
    : "from the current pool";

const buildMatchNoteSentence = ({ suggestedPersonName, noteSummary }) =>
  finalizeSentence(
    `You should talk to ${suggestedPersonName} because ${noteSummary.primaryReason} and this match ranked best ${buildPoolContext(noteSummary.candidatePoolSize)}`,
  );

const buildMatchNoteMeta = (overrides = {}) => ({
  provider: MATCH_NOTE_PROVIDER,
  model: null,
  usedFallback: false,
  strategy: MATCH_NOTE_STRATEGY,
  reasons: [],
  ...overrides,
});

const buildUserNoteEntries = ({ seeker, candidate, noteSummary }) => {
  const seekerId = getUserId(seeker);
  const candidateId = getUserId(candidate);
  const seekerName = getDisplayName(seeker);
  const candidateName = getDisplayName(candidate);

  const noteEntries = [
    seekerId
      ? [
          seekerId,
          buildMatchNoteSentence({
            suggestedPersonName: candidateName,
            noteSummary,
          }),
        ]
      : null,
    candidateId
      ? [
          candidateId,
          buildMatchNoteSentence({
            suggestedPersonName: seekerName,
            noteSummary,
          }),
        ]
      : null,
  ].filter(Boolean);

  return {
    seekerId,
    candidateId,
    candidateName,
    notesByUser: Object.fromEntries(noteEntries),
  };
};

const logMatchNoteGeneration = ({ seekerId, candidateId, noteSummary }) => {
  console.info(`${MATCH_NOTE_LOG_PREFIX} generating notes`, {
    provider: MATCH_NOTE_PROVIDER,
    seekerId: seekerId || null,
    candidateId: candidateId || null,
    poolMode: noteSummary.poolMode,
    candidatePoolSize: noteSummary.candidatePoolSize,
  });
};

export const generateMatchNote = ({ viewer, otherUser, matchingNote }) => {
  const noteSummary = summarizeMatchingNote(matchingNote);
  const sentence = buildMatchNoteSentence({
    suggestedPersonName: getDisplayName(otherUser),
    noteSummary,
  });

  return {
    sentence,
    meta: buildMatchNoteMeta({
      viewerId: getUserId(viewer) || null,
      otherUserId: getUserId(otherUser) || null,
    }),
  };
};

export const generateMatchNotesByUser = ({
  seeker,
  candidate,
  matchingNote,
}) => {
  const noteSummary = summarizeMatchingNote(matchingNote);
  const { seekerId, candidateId, candidateName, notesByUser } =
    buildUserNoteEntries({
      seeker,
      candidate,
      noteSummary,
    });

  logMatchNoteGeneration({
    seekerId,
    candidateId,
    noteSummary,
  });

  return {
    notesByUser,
    primarySentence:
      notesByUser[seekerId] ||
      buildMatchNoteSentence({
        suggestedPersonName: candidateName,
        noteSummary,
      }),
    meta: buildMatchNoteMeta({
      seekerId: seekerId || null,
      candidateId: candidateId || null,
    }),
  };
};
