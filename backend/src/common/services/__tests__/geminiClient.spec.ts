import {
  GeminiClient,
  GeminiRateLimitError,
  GeminiQuotaExceededError,
  GeminiAPIError,
} from '../geminiClient.js';
import type { GeminiPayload } from '../../types/geminiTypes.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API_KEY = 'test-key-abc123';

function makePayload(text = 'Hello'): GeminiPayload {
  return {
    contents: [{ role: 'user', parts: [{ text }] }],
  };
}

function okResponse(text: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [
        { content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' },
      ],
    }),
  };
}

function errorResponse(code: number, message: string, httpStatus?: number) {
  return {
    ok: (httpStatus ?? code) < 400,
    status: httpStatus ?? code,
    json: async () => ({
      error: { code, message, status: 'ERROR' },
    }),
  };
}

function noCandidatesResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({ candidates: [] }),
  };
}

function safetyBlockedResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [
        { content: { role: 'model', parts: [{ text: '' }] }, finishReason: 'SAFETY' },
      ],
    }),
  };
}

// ---------------------------------------------------------------------------
// Constructor validation
// ---------------------------------------------------------------------------

describe('GeminiClient — constructor', () => {
  it('throws when apiKey is empty', () => {
    expect(() => new GeminiClient({ apiKey: '' })).toThrow('API key is required');
  });

  it('accepts valid config', () => {
    const client = new GeminiClient({ apiKey: API_KEY });
    expect(client).toBeInstanceOf(GeminiClient);
  });
});

// ---------------------------------------------------------------------------
// Successful generation
// ---------------------------------------------------------------------------

describe('GeminiClient — generate (happy path)', () => {
  let fetchSpy: jest.SpyInstance;

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it('returns the text from the first candidate', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(okResponse('{"result":42}') as any);

    const client = new GeminiClient({ apiKey: API_KEY });
    const result = await client.generate(makePayload());

    expect(result).toBe('{"result":42}');
  });

  it('sends the payload to the correct URL with the API key', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(okResponse('ok') as any);

    const client = new GeminiClient({ apiKey: API_KEY, model: 'gemini-2.5-flash' });
    await client.generate(makePayload());

    const url = (fetchSpy.mock.calls[0][0] as string);
    expect(url).toContain('gemini-2.5-flash:generateContent');
    expect(url).toContain(`key=${API_KEY}`);
  });

  it('includes generationConfig in the request body', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(okResponse('ok') as any);

    const client = new GeminiClient({
      apiKey: API_KEY,
      temperature: 0.5,
      maxOutputTokens: 4096,
    });
    await client.generate(makePayload());

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.generationConfig.temperature).toBe(0.5);
    expect(body.generationConfig.maxOutputTokens).toBe(4096);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('concatenates text from multiple parts', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: '{"a":' }, { text: '1}' }],
            },
            finishReason: 'STOP',
          },
        ],
      }),
    } as any);

    const client = new GeminiClient({ apiKey: API_KEY });
    const result = await client.generate(makePayload());
    expect(result).toBe('{"a":1}');
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('GeminiClient — error handling', () => {
  let fetchSpy: jest.SpyInstance;

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it('throws GeminiRateLimitError on 429 API error', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      errorResponse(429, 'Rate limit exceeded') as any,
    );

    const client = new GeminiClient({ apiKey: API_KEY, maxRetries: 0 });
    await expect(client.generate(makePayload())).rejects.toThrow(GeminiRateLimitError);
  });

  it('throws GeminiAPIError on non-429 API error', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      errorResponse(400, 'Bad request') as any,
    );

    const client = new GeminiClient({ apiKey: API_KEY, maxRetries: 0 });
    await expect(client.generate(makePayload())).rejects.toThrow(GeminiAPIError);
  });

  it('throws GeminiAPIError when no candidates returned', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      noCandidatesResponse() as any,
    );

    const client = new GeminiClient({ apiKey: API_KEY, maxRetries: 0 });
    await expect(client.generate(makePayload())).rejects.toThrow('no candidates');
  });

  it('throws GeminiAPIError on safety-blocked response', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      safetyBlockedResponse() as any,
    );

    const client = new GeminiClient({ apiKey: API_KEY, maxRetries: 0 });
    await expect(client.generate(makePayload())).rejects.toThrow('safety');
  });

  it('throws GeminiAPIError on non-ok HTTP status without error body', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    } as any);

    const client = new GeminiClient({ apiKey: API_KEY, maxRetries: 0 });
    await expect(client.generate(makePayload())).rejects.toThrow('503');
  });
});

// ---------------------------------------------------------------------------
// Retry logic
// ---------------------------------------------------------------------------

describe('GeminiClient — retries', () => {
  let fetchSpy: jest.SpyInstance;

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it('retries on 500 and succeeds on second attempt', async () => {
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(errorResponse(500, 'Internal error', 500) as any)
      .mockResolvedValueOnce(okResponse('retry-ok') as any);

    const client = new GeminiClient({
      apiKey: API_KEY,
      maxRetries: 3,
      baseRetryDelayMs: 1, // fast for tests
    });
    const result = await client.generate(makePayload());

    expect(result).toBe('retry-ok');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('retries on fetch network errors', async () => {
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('fetch failed: network error'))
      .mockResolvedValueOnce(okResponse('recovered') as any);

    const client = new GeminiClient({
      apiKey: API_KEY,
      maxRetries: 2,
      baseRetryDelayMs: 1,
    });
    const result = await client.generate(makePayload());

    expect(result).toBe('recovered');
  });

  it('gives up after maxRetries exhausted', async () => {
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(errorResponse(500, 'persistent failure', 500) as any);

    const client = new GeminiClient({
      apiKey: API_KEY,
      maxRetries: 2,
      baseRetryDelayMs: 1,
    });

    await expect(client.generate(makePayload())).rejects.toThrow('persistent failure');
    // initial attempt + 2 retries = 3 calls
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-retryable errors (400)', async () => {
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(errorResponse(400, 'Bad request') as any);

    const client = new GeminiClient({
      apiKey: API_KEY,
      maxRetries: 3,
      baseRetryDelayMs: 1,
    });

    await expect(client.generate(makePayload())).rejects.toThrow(GeminiAPIError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Rate limiter
// ---------------------------------------------------------------------------

describe('GeminiClient — rate limiting', () => {
  let fetchSpy: jest.SpyInstance;

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it('throws GeminiQuotaExceededError when daily quota is reached', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(okResponse('ok') as any);

    const client = new GeminiClient({
      apiKey: API_KEY,
      rateLimiter: { requestsPerMinute: 100, requestsPerDay: 2 },
    });

    // First two requests should succeed
    await client.generate(makePayload());
    await client.generate(makePayload());

    // Third request should be rejected by rate limiter
    await expect(client.generate(makePayload())).rejects.toThrow(GeminiQuotaExceededError);
  });

  it('queues requests when per-minute limit is reached (waits for slot)', async () => {
    // The client's FIFO queue will wait for a rate-limit slot rather than
    // throwing immediately.  We verify the queue detects the wait by checking
    // that the console.log for waiting is emitted and the third call is
    // still pending (we don't await it — just verify the queue engages).
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(okResponse('ok') as any);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const client = new GeminiClient({
      apiKey: API_KEY,
      rateLimiter: { requestsPerMinute: 2, requestsPerDay: 1000 },
    });

    await client.generate(makePayload());
    await client.generate(makePayload());

    // Third call enters the queue and should trigger the wait log
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    client.generate(makePayload());

    // Give the queue a tick to process
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Rate limit: waiting'),
    );

    logSpy.mockRestore();

    // Clean up: we don't await pendingPromise to avoid the 60s wait
    // The force-exit in jest config handles cleanup
  });

  it('never retries quota exceeded errors', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(okResponse('ok') as any);

    const client = new GeminiClient({
      apiKey: API_KEY,
      maxRetries: 5,
      rateLimiter: { requestsPerMinute: 100, requestsPerDay: 1 },
    });

    await client.generate(makePayload());
    await expect(client.generate(makePayload())).rejects.toThrow(GeminiQuotaExceededError);

    // Only 1 fetch call — quota error is not retried
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Custom error classes
// ---------------------------------------------------------------------------

describe('Error classes', () => {
  it('GeminiRateLimitError has correct name', () => {
    const err = new GeminiRateLimitError('too fast');
    expect(err.name).toBe('GeminiRateLimitError');
    expect(err.message).toBe('too fast');
    expect(err).toBeInstanceOf(Error);
  });

  it('GeminiQuotaExceededError has correct name', () => {
    const err = new GeminiQuotaExceededError('daily limit');
    expect(err.name).toBe('GeminiQuotaExceededError');
    expect(err).toBeInstanceOf(Error);
  });

  it('GeminiAPIError exposes statusCode', () => {
    const err = new GeminiAPIError('not found', 404);
    expect(err.name).toBe('GeminiAPIError');
    expect(err.statusCode).toBe(404);
    expect(err).toBeInstanceOf(Error);
  });
});
