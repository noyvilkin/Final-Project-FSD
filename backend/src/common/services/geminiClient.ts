import { GeminiAPIResponse, GeminiPayload, GeminiRequestBody, RateLimiterConfig } from "../types/geminiTypes.js"

export class GeminiRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiRateLimitError';
  }
}

export class GeminiQuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiQuotaExceededError';
  }
}

export class GeminiAPIError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'GeminiAPIError';
  }
}


class RateLimiter {
  private minuteWindow: number[] = [];   // timestamps of requests in the last 60s
  private dayWindow:    number[] = [];   // timestamps of requests in the last 24h
  private readonly config: RateLimiterConfig;

  constructor(config: RateLimiterConfig) {
    this.config = config;
  }

  /**
   * Checks whether a new request can proceed right now.
   * Throws GeminiRateLimitError / GeminiQuotaExceededError if not.
   */
  acquire(): void {
    const now = Date.now();
    this.prune(now);

    if (this.dayWindow.length >= this.config.requestsPerDay) {
      throw new GeminiQuotaExceededError(
        `Daily Gemini quota of ${this.config.requestsPerDay} requests reached. ` +
        `Resets at midnight Pacific time.`
      );
    }

    if (this.minuteWindow.length >= this.config.requestsPerMinute) {
      const oldestInWindow = this.minuteWindow[0];
      const waitMs         = 60_000 - (now - oldestInWindow);
      throw new GeminiRateLimitError(
        `Gemini rate limit: ${this.config.requestsPerMinute} req/min exceeded. ` +
        `Retry in ${Math.ceil(waitMs / 1000)}s.`
      );
    }

    this.minuteWindow.push(now);
    this.dayWindow.push(now);
  }

  /** Returns ms to wait before the next slot opens, or 0 if already available */
  msUntilNextSlot(): number {
    const now = Date.now();
    this.prune(now);

    if (this.minuteWindow.length < this.config.requestsPerMinute) return 0;

    const oldestInWindow = this.minuteWindow[0];
    return Math.max(0, 60_000 - (now - oldestInWindow));
  }

  private prune(now: number): void {
    this.minuteWindow = this.minuteWindow.filter(t => now - t < 60_000);
    this.dayWindow    = this.dayWindow.filter(t => now - t < 86_400_000);
  }
}


export interface GeminiClientConfig {
  apiKey:             string;
  /** Gemini model to use. Defaults to gemini-2.5-flash (free tier) */
  model?:             string;
  /** Max retries on transient errors. Default: 3 */
  maxRetries?:        number;
  /** Base delay in ms for exponential back-off. Default: 1000 */
  baseRetryDelayMs?:  number;
  /** Temperature for generation. Default: 0.2 */
  temperature?:       number;
  /** Max output tokens. Default: 2048 */
  maxOutputTokens?:   number;
  /** Rate limiter config. Defaults to free-tier safe values */
  rateLimiter?:       Partial<RateLimiterConfig>;
}

export class GeminiClient {
  private readonly apiKey:    string;
  private readonly model:     string;
  private readonly baseUrl =  'https://generativelanguage.googleapis.com/v1beta/models';
  private readonly maxRetries:       number;
  private readonly baseRetryDelayMs: number;
  private readonly temperature:      number;
  private readonly maxOutputTokens:  number;
  private readonly rateLimiter:      RateLimiter;

  // Simple FIFO queue — prevents concurrent callers from racing on the limiter
  private queue: Array<() => void> = [];
  private processing = false;

  constructor(config: GeminiClientConfig) {
    if (!config.apiKey) throw new Error('Gemini API key is required');

    this.apiKey           = config.apiKey;
    this.model            = config.model            ?? 'gemini-2.5-flash';
    this.maxRetries       = config.maxRetries        ?? 3;
    this.baseRetryDelayMs = config.baseRetryDelayMs  ?? 1_000;
    this.temperature      = config.temperature       ?? 0.2;
    this.maxOutputTokens  = config.maxOutputTokens   ?? 2_048;

    this.rateLimiter = new RateLimiter({
      requestsPerMinute: config.rateLimiter?.requestsPerMinute ?? 10,  // conservative (free tier = 15)
      requestsPerDay:    config.rateLimiter?.requestsPerDay    ?? 1_400, // conservative (free tier = 1,500)
    });
  }


  /**
   * Send a payload to Gemini and return the raw text response.
   * Handles rate limiting, queuing, and retries internally.
   */
  async generate(payload: GeminiPayload): Promise<string> {
    return this.enqueue(() => this.generateWithRetry(payload));
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try { resolve(await task()); }
        catch (err) { reject(err); }
      });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      // Wait for a rate-limit slot if needed
      const waitMs = this.rateLimiter.msUntilNextSlot();
      if (waitMs > 0) {
        console.log(`[GeminiClient] Rate limit: waiting ${waitMs}ms for next slot`);
        await this.sleep(waitMs + 50); // +50ms buffer
      }

      const task = this.queue.shift();
      if (task) await task();
    }

    this.processing = false;
  }

  private async generateWithRetry(payload: GeminiPayload, attempt = 0): Promise<string> {
    try {
      // Acquire a rate-limit slot (throws immediately if quota exceeded)
      this.rateLimiter.acquire();
      return await this.callAPI(payload);
    } catch (err) {
      // Never retry quota errors — caller must handle them
      if (err instanceof GeminiQuotaExceededError) throw err;

      const isRetryable =
        err instanceof GeminiRateLimitError ||
        (err instanceof GeminiAPIError && [429, 500, 502, 503, 504].includes(err.statusCode)) ||
        (err instanceof Error && err.message.includes('fetch'));

      if (!isRetryable || attempt >= this.maxRetries) throw err;

      const delay = this.baseRetryDelayMs * Math.pow(2, attempt);
      console.warn(`[GeminiClient] Retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries}): ${(err as Error).message}`);
      await this.sleep(delay);

      return this.generateWithRetry(payload, attempt + 1);
    }
  }


  private async callAPI(payload: GeminiPayload): Promise<string> {
    const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;

    const { generationConfig: overrides, ...rest } = payload;

    const body: GeminiRequestBody = {
      ...rest,
      generationConfig: {
        temperature:      this.temperature,
        maxOutputTokens:  this.maxOutputTokens,
        responseMimeType: 'application/json',
        ...overrides,
      },
    };

    const res = await fetch(url, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify(body),
    });

    const data = await res.json() as GeminiAPIResponse;

    if (data.error) {
      if (data.error.code === 429) {
        throw new GeminiRateLimitError(`Gemini 429: ${data.error.message}`);
      }
      throw new GeminiAPIError(`Gemini error: ${data.error.message}`, data.error.code);
    }

    if (!res.ok) {
      throw new GeminiAPIError(`Gemini HTTP ${res.status}`, res.status);
    }

    const candidate = data.candidates?.[0];
    if (!candidate) throw new GeminiAPIError('Gemini returned no candidates', 500);

    if (candidate.finishReason === 'SAFETY') {
      throw new GeminiAPIError('Gemini blocked response due to safety filters', 400);
    }

    const text = candidate.content.parts.map(p => p.text).join('');

    // A MAX_TOKENS finish almost always yields truncated (invalid) JSON. Surface it
    // as a retryable server error so callers/back-off can re-request a full response.
    if (candidate.finishReason === 'MAX_TOKENS') {
      throw new GeminiAPIError('Gemini response truncated (MAX_TOKENS) — increase maxOutputTokens', 500);
    }

    return text;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Re-export types for convenience
export type { GeminiPayload } from "../types/geminiTypes.js"
