import { LLMPayload } from "../types/llmTypes.js"
import type { LLMClient } from "./llmClient.js"

export class ColmanRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ColmanRateLimitError';
  }
}

export class ColmanAPIError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'ColmanAPIError';
  }
}

interface OpenAIChatMessage {
  role:    'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIChatCompletionResponse {
  choices?: Array<{
    message:       { role: string; content: string };
    finish_reason: string;
  }>;
  error?: { message: string; type?: string; code?: string };
}

// The nginx proxy in front of the Colman LLM service rate-limits /v1/* to
// 5 requests/minute per source IP — shared across the whole app, not per
// service — so all ColmanLLMClient instances queue on one module-level
// limiter instead of each keeping its own count.
class RateLimiter {
  private minuteWindow: number[] = [];

  constructor(private readonly requestsPerMinute: number) {}

  acquire(): void {
    const now = Date.now();
    this.prune(now);

    if (this.minuteWindow.length >= this.requestsPerMinute) {
      const oldestInWindow = this.minuteWindow[0];
      const waitMs         = 60_000 - (now - oldestInWindow);
      throw new ColmanRateLimitError(
        `Colman LLM rate limit: ${this.requestsPerMinute} req/min exceeded. Retry in ${Math.ceil(waitMs / 1000)}s.`
      );
    }

    this.minuteWindow.push(now);
  }

  msUntilNextSlot(): number {
    const now = Date.now();
    this.prune(now);

    if (this.minuteWindow.length < this.requestsPerMinute) return 0;

    const oldestInWindow = this.minuteWindow[0];
    return Math.max(0, 60_000 - (now - oldestInWindow));
  }

  private prune(now: number): void {
    this.minuteWindow = this.minuteWindow.filter(t => now - t < 60_000);
  }
}

const sharedRateLimiter = new RateLimiter(5);
const sharedQueue: Array<() => Promise<void>> = [];
let sharedProcessing = false;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    sharedQueue.push(async () => {
      try { resolve(await task()); }
      catch (err) { reject(err); }
    });
    processSharedQueue();
  });
}

async function processSharedQueue(): Promise<void> {
  if (sharedProcessing) return;
  sharedProcessing = true;

  while (sharedQueue.length > 0) {
    const waitMs = sharedRateLimiter.msUntilNextSlot();
    if (waitMs > 0) {
      console.log(`[ColmanLLMClient] Rate limit: waiting ${waitMs}ms for next slot`);
      await sleep(waitMs + 50);
    }

    const task = sharedQueue.shift();
    if (task) await task();
  }

  sharedProcessing = false;
}


export interface ColmanLLMClientConfig {
  /** Colman LLM service student username */
  username:           string;
  /** Colman LLM service student password */
  password:           string;
  /** Base URL of the Colman LLM service, e.g. http://10.10.248.41. Defaults to COLMAN_LLM_BASE_URL / http://10.10.248.41 */
  baseUrl?:           string;
  /** Model to use on the OpenAI-compatible endpoint. Defaults to llama3.1:8b */
  model?:             string;
  /** Max retries on transient errors. Default: 3 */
  maxRetries?:        number;
  /** Base delay in ms for exponential back-off. Default: 1000 */
  baseRetryDelayMs?:  number;
  /** Temperature for generation. Default: 0.2 */
  temperature?:       number;
  /** Max output tokens. Default: 2048 */
  maxOutputTokens?:   number;
}

/**
 * Client for the Colman College LLM service's OpenAI-compatible endpoint
 * (llama3.1:8b via /v1/chat/completions), authenticated with HTTP Basic
 * Auth through the nginx proxy. Requires VPN access to the Colman internal
 * network to reach the server.
 *
 * Accepts the same LLMPayload wire-shape (system_instruction + contents)
 * used across this codebase's prompt builders, and translates it into
 * OpenAI chat messages internally — this keeps prompt-construction code
 * unchanged when swapping the underlying LLM provider.
 */
export class ColmanLLMClient implements LLMClient {
  private readonly username:         string;
  private readonly password:         string;
  private readonly baseUrl:          string;
  private readonly model:            string;
  private readonly maxRetries:       number;
  private readonly baseRetryDelayMs: number;
  private readonly temperature:      number;
  private readonly maxOutputTokens:  number;

  constructor(config: ColmanLLMClientConfig) {
    if (!config.username) throw new Error('Colman LLM username is required');
    if (!config.password) throw new Error('Colman LLM password is required');

    this.username         = config.username;
    this.password         = config.password;
    this.baseUrl          = (config.baseUrl ?? 'http://10.10.248.41').replace(/\/$/, '');
    this.model            = config.model            ?? 'llama3.1:8b';
    this.maxRetries       = config.maxRetries        ?? 3;
    this.baseRetryDelayMs = config.baseRetryDelayMs  ?? 1_000;
    this.temperature      = config.temperature       ?? 0.2;
    this.maxOutputTokens  = config.maxOutputTokens   ?? 2_048;
  }

  /**
   * Send a payload to the Colman LLM service and return the raw text response.
   * Handles rate limiting, queuing, and retries internally.
   */
  async generate(payload: LLMPayload): Promise<string> {
    return enqueue(() => this.generateWithRetry(payload));
  }

  private async generateWithRetry(payload: LLMPayload, attempt = 0): Promise<string> {
    try {
      sharedRateLimiter.acquire();
      return await this.callAPI(payload);
    } catch (err) {
      const isRetryable =
        err instanceof ColmanRateLimitError ||
        (err instanceof ColmanAPIError && [429, 500, 502, 503, 504].includes(err.statusCode)) ||
        (err instanceof Error && err.message.includes('fetch'));

      if (!isRetryable || attempt >= this.maxRetries) throw err;

      const delay = this.baseRetryDelayMs * Math.pow(2, attempt);
      console.warn(`[ColmanLLMClient] Retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries}): ${(err as Error).message}`);
      await sleep(delay);

      return this.generateWithRetry(payload, attempt + 1);
    }
  }

  private toMessages(payload: LLMPayload): OpenAIChatMessage[] {
    const messages: OpenAIChatMessage[] = [];

    if (payload.system_instruction) {
      messages.push({
        role:    'system',
        content: payload.system_instruction.parts.map(p => p.text).join(''),
      });
    }

    for (const content of payload.contents) {
      messages.push({
        role:    content.role === 'model' ? 'assistant' : 'user',
        content: content.parts.map(p => p.text).join(''),
      });
    }

    return messages;
  }

  private async callAPI(payload: LLMPayload): Promise<string> {
    const url = `${this.baseUrl}/v1/chat/completions`;
    const credentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');

    // Gemini always forced responseMimeType: 'application/json' by default, and
    // every current caller expects a JSON body back — so mirror that here via
    // the OpenAI-compatible response_format field (supported by this endpoint's
    // Ollama-backed proxy). A per-call responseSchema (Gemini's constrained
    // decoding) maps to the stricter json_schema mode; otherwise plain
    // json_object mode reproduces the old always-on JSON behavior.
    const responseSchema = payload.generationConfig?.responseSchema;
    const responseFormat = responseSchema
      ? { type: 'json_schema' as const, json_schema: { name: 'response', schema: responseSchema } }
      : { type: 'json_object' as const };

    const body = {
      model:           this.model,
      messages:        this.toMessages(payload),
      temperature:     payload.generationConfig?.temperature     ?? this.temperature,
      max_tokens:      payload.generationConfig?.maxOutputTokens ?? this.maxOutputTokens,
      response_format: responseFormat,
    };

    const res = await fetch(url, {
      method:  'POST',
      headers: {
        'content-type':  'application/json',
        'authorization': `Basic ${credentials}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json() as OpenAIChatCompletionResponse;

    if (res.status === 429) {
      throw new ColmanRateLimitError(`Colman LLM 429: ${data.error?.message ?? 'rate limit exceeded'}`);
    }

    if (data.error) {
      throw new ColmanAPIError(`Colman LLM error: ${data.error.message}`, res.status || 500);
    }

    if (!res.ok) {
      throw new ColmanAPIError(`Colman LLM HTTP ${res.status}`, res.status);
    }

    const choice = data.choices?.[0];
    if (!choice) throw new ColmanAPIError('Colman LLM returned no choices', 500);

    return choice.message.content;
  }
}

// Re-export the shared payload type for convenience
export type { LLMPayload } from "../types/llmTypes.js"
