import OpenAI from "openai";
import { normalizeString, trimString } from "../utils/strings.js";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const NVIDIA_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";
const NVIDIA_DEFAULT_TIMEOUT_MS = 15000;
const NVIDIA_DEFAULT_MAX_TOKENS = 512;
const NVIDIA_REASONING_BUDGET = 128;

const isThinkingEnabled = () => {
  const value = normalizeString(process.env.NVIDIA_MATCH_NOTE_ENABLE_THINKING);
  return value
    ? ["1", "true", "yes", "on"].includes(value)
    : true;
};

export const getNvidiaApiKey = () => trimString(process.env.NVIDIA_API_KEY);

export const getNvidiaModel = () => NVIDIA_MODEL;

export const getNvidiaTimeoutMs = () => {
  const timeoutMs = Number(process.env.NVIDIA_MATCH_NOTE_TIMEOUT_MS);
  return Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : NVIDIA_DEFAULT_TIMEOUT_MS;
};

export const requestNvidiaChatCompletion = (apiKey, messages, timeoutMs) => {
  const client = new OpenAI({
    apiKey,
    baseURL: NVIDIA_BASE_URL,
    timeout: timeoutMs || getNvidiaTimeoutMs(),
    maxRetries: 0,
  });

  return client.chat.completions.create({
    model: NVIDIA_MODEL,
    messages,
    max_tokens: NVIDIA_DEFAULT_MAX_TOKENS,
    reasoning_budget: NVIDIA_REASONING_BUDGET,
    temperature: 1,
    top_p: 0.95,
    stream: false,
    chat_template_kwargs: { enable_thinking: isThinkingEnabled() },
  });
};
