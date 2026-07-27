import { ColmanLLMClient } from "./colmanLLMClient.js"
import type { LLMClient } from "./llmClient.js"

export interface LLMClientOverrides {
  model?:           string;
  temperature?:     number;
  maxOutputTokens?: number;
}

/**
 * Single construction point for the LLM client shared by every AI feature.
 * To swap providers, write a new class implementing LLMClient and change
 * what this function returns — no call sites need to change.
 */
export function createLLMClient(overrides: LLMClientOverrides = {}): LLMClient {
  const username = process.env.COLMAN_LLM_USERNAME;
  const password = process.env.COLMAN_LLM_PASSWORD;
  if (!username || !password) {
    throw new Error('COLMAN_LLM_USERNAME and COLMAN_LLM_PASSWORD environment variables are required');
  }

  return new ColmanLLMClient({
    username,
    password,
    baseUrl: process.env.COLMAN_LLM_BASE_URL,
    // Falls through to ColmanLLMClient's own default when unset — that class
    // is the single place that knows the fallback model, so it never drifts
    // out of sync with a copy hardcoded here.
    model:   process.env.COLMAN_LLM_MODEL,
    ...overrides,
  });
}
