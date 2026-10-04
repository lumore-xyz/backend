import axios from "axios";
import { normalizeString, trimString } from "../utils/strings.js";

const NVIDIA_CHAT_COMPLETIONS_URL =
  "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_DEFAULT_MODEL = "google/gemma-4-31b-it";
const NVIDIA_DEFAULT_TIMEOUT_MS = 15000;
const NVIDIA_DEFAULT_MAX_TOKENS = 120;

const isThinkingEnabled = () =>
  ["1", "true", "yes", "on"].includes(
    normalizeString(process.env.NVIDIA_MATCH_NOTE_ENABLE_THINKING),
  );

export const getNvidiaApiKey = () => trimString(process.env.NVIDIA_API_KEY);

export const getNvidiaModel = () =>
  trimString(process.env.NVIDIA_MATCH_NOTE_MODEL) || NVIDIA_DEFAULT_MODEL;

export const getNvidiaTimeoutMs = () => {
  const timeoutMs = Number(process.env.NVIDIA_MATCH_NOTE_TIMEOUT_MS);
  return Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : NVIDIA_DEFAULT_TIMEOUT_MS;
};

export const requestNvidiaChatCompletion = (apiKey, messages, timeoutMs) =>
  axios.post(
    NVIDIA_CHAT_COMPLETIONS_URL,
    {
      model: getNvidiaModel(),
      messages,
      max_tokens: NVIDIA_DEFAULT_MAX_TOKENS,
      temperature: 1,
      top_p: 0.95,
      stream: false,
      chat_template_kwargs: { enable_thinking: isThinkingEnabled() },
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      responseType: "json",
      timeout: timeoutMs || getNvidiaTimeoutMs(),
    },
  );
