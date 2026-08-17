/**
 * Unit tests for WhisperClient.
 *
 * Isolated from the transcription pipeline (interview.transcription.test.ts
 * covers that end to end) — these test the client itself: response mapping,
 * error classification, and the retry/backoff behavior on transient
 * failures, none of which had any coverage before.
 */

process.env.S3_ENDPOINT          = 'http://localhost:9000';
process.env.S3_ACCESS_KEY_ID     = 'test-key';
process.env.S3_SECRET_ACCESS_KEY = 'test-secret';
process.env.S3_BUCKET_NAME       = 'test-bucket';
process.env.OPENAI_API_KEY       = 'test-openai-key';
process.env.WHISPER_MODEL        = 'whisper-1';

import fs from 'fs';
import os from 'os';
import path from 'path';

// ─── OpenAI mock ────────────────────────────────────────────────────────────

const mockTranscribeCreate = jest.fn();

jest.mock('openai', () => {
  class APIError extends Error {
    status: number;
    constructor(message: string, status = 500) {
      super(message);
      this.status = status;
      this.name   = 'APIError';
    }
  }
  const OpenAIMock = jest.fn().mockImplementation(() => ({
    audio: { transcriptions: { create: mockTranscribeCreate } },
  }));
  (OpenAIMock as any).APIError = APIError;
  return { __esModule: true, default: OpenAIMock, APIError };
});

import OpenAI from 'openai';
import { WhisperClient, WhisperAPIError } from '../../common/services/whisperClient.js';

// A real (tiny) file on disk — createReadStream needs a path that exists.
const audioPath = path.join(os.tmpdir(), `whisper-test-${Date.now()}.mp3`);

beforeAll(() => {
  fs.writeFileSync(audioPath, Buffer.from('fake-audio-data'));
});

afterAll(() => {
  fs.rmSync(audioPath, { force: true });
});

beforeEach(() => {
  mockTranscribeCreate.mockReset();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('WhisperClient.transcribe', () => {
  it('maps a successful verbose_json response', async () => {
    mockTranscribeCreate.mockResolvedValue({
      text: '  Tell me about a time you led a project.  ',
      language: 'english',
      duration: 12.5,
      segments: [
        { start: 0, end: 5, text: '  Tell me about a time  ' },
        { start: 5, end: 10, text: 'you led a project.' },
      ],
    });

    const result = await WhisperClient.transcribe(audioPath);

    expect(result.text).toBe('Tell me about a time you led a project.');
    expect(result.language).toBe('english');
    expect(result.durationSeconds).toBe(12.5);
    expect(result.provider).toBe('openai-whisper');
    expect(result.model).toBe('whisper-1');
    expect(result.segments).toEqual([
      { start: 0, end: 5, text: 'Tell me about a time' },
      { start: 5, end: 10, text: 'you led a project.' },
    ]);
    expect(mockTranscribeCreate).toHaveBeenCalledTimes(1);
  });

  it('falls back to an empty segments array when the response omits them', async () => {
    mockTranscribeCreate.mockResolvedValue({ text: 'Hi.', language: 'english' });

    const result = await WhisperClient.transcribe(audioPath);

    expect(result.segments).toEqual([]);
    expect(result.durationSeconds).toBeUndefined();
  });

  it('passes the WHISPER_LANGUAGE hint through when set', async () => {
    process.env.WHISPER_LANGUAGE = 'he';
    mockTranscribeCreate.mockResolvedValue({ text: 'שלום', language: 'hebrew', segments: [] });

    await WhisperClient.transcribe(audioPath);

    expect(mockTranscribeCreate).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'he' })
    );
    delete process.env.WHISPER_LANGUAGE;
  });

  it('omits the language param when WHISPER_LANGUAGE is unset', async () => {
    delete process.env.WHISPER_LANGUAGE;
    mockTranscribeCreate.mockResolvedValue({ text: 'Hi.', language: 'english', segments: [] });

    await WhisperClient.transcribe(audioPath);

    const callArgs = mockTranscribeCreate.mock.calls[0][0];
    expect(callArgs).not.toHaveProperty('language');
  });

  it('throws WhisperAPIError (not retrying) on a non-retryable 400', async () => {
    mockTranscribeCreate.mockRejectedValue(new (OpenAI as any).APIError('bad file format', 400));

    await expect(WhisperClient.transcribe(audioPath)).rejects.toThrow(WhisperAPIError);
    expect(mockTranscribeCreate).toHaveBeenCalledTimes(1);
  });

  it('retries a 429 and succeeds on the second attempt', async () => {
    mockTranscribeCreate
      .mockRejectedValueOnce(new (OpenAI as any).APIError('rate limited', 429))
      .mockResolvedValueOnce({ text: 'Recovered.', language: 'english', segments: [] });

    const resultPromise = WhisperClient.transcribe(audioPath);
    // Let the retry's backoff timer fire without waiting 1s of real time.
    await jest.advanceTimersByTimeAsync(1_000);
    const result = await resultPromise;

    expect(result.text).toBe('Recovered.');
    expect(mockTranscribeCreate).toHaveBeenCalledTimes(2);
  });

  it('retries 5xx errors up to the max, then throws WhisperAPIError', async () => {
    mockTranscribeCreate.mockRejectedValue(new (OpenAI as any).APIError('server error', 503));

    const resultPromise = WhisperClient.transcribe(audioPath);
    resultPromise.catch(() => {}); // avoid an unhandled-rejection warning while timers advance
    // 3 retries: 1s, 2s, 4s backoff
    await jest.advanceTimersByTimeAsync(1_000);
    await jest.advanceTimersByTimeAsync(2_000);
    await jest.advanceTimersByTimeAsync(4_000);

    await expect(resultPromise).rejects.toThrow(WhisperAPIError);
    expect(mockTranscribeCreate).toHaveBeenCalledTimes(4); // initial + 3 retries
  });

  it('does not retry a generic non-network error', async () => {
    mockTranscribeCreate.mockRejectedValue(new Error('unexpected parsing failure'));

    await expect(WhisperClient.transcribe(audioPath)).rejects.toThrow('unexpected parsing failure');
    expect(mockTranscribeCreate).toHaveBeenCalledTimes(1);
  });

  it('retries a network-level "fetch failed" error', async () => {
    mockTranscribeCreate
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce({ text: 'Recovered.', language: 'english', segments: [] });

    const resultPromise = WhisperClient.transcribe(audioPath);
    await jest.advanceTimersByTimeAsync(1_000);
    const result = await resultPromise;

    expect(result.text).toBe('Recovered.');
    expect(mockTranscribeCreate).toHaveBeenCalledTimes(2);
  });
});

describe('WhisperClient.currentModel', () => {
  it('returns the configured model without calling the API', () => {
    expect(WhisperClient.currentModel()).toBe('whisper-1');
    expect(mockTranscribeCreate).not.toHaveBeenCalled();
  });
});
