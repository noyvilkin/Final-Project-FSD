import type { LLMPayload } from "../types/llmTypes.js"

/**
 * Provider-agnostic contract for anything that can turn a prompt payload
 * into raw text. Every AI feature in this codebase depends on this
 * interface rather than a concrete client class, so swapping the
 * underlying LLM provider means writing one new class that implements
 * this interface and updating llmClientFactory.ts — no call sites change.
 */
export interface LLMClient {
  /** The exact model identifier this client is configured to call — callers
   *  that need to report/log which model produced a response (e.g. for a
   *  "Model: X" UI label) should read this instead of re-deriving it from
   *  env vars, so there is exactly one place that resolves the model name. */
  readonly model: string;

  generate(payload: LLMPayload): Promise<string>;
}

// Re-export the shared payload type for convenience
export type { LLMPayload } from "../types/llmTypes.js"
