import type { GeminiPayload } from "../types/geminiTypes.js"

/**
 * Provider-agnostic contract for anything that can turn a prompt payload
 * into raw text. Every AI feature in this codebase depends on this
 * interface rather than a concrete client class, so swapping the
 * underlying LLM provider means writing one new class that implements
 * this interface and updating llmClientFactory.ts — no call sites change.
 */
export interface LLMClient {
  generate(payload: GeminiPayload): Promise<string>;
}

// Re-export the shared payload type for convenience
export type { GeminiPayload } from "../types/geminiTypes.js"
