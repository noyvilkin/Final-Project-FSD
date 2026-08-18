import OpenAI from 'openai';
import { createReadStream } from 'fs';
import { appLogger } from './logger.js';
import type { ITranscriptSegment } from '../../features/interview/models/interviewInsights.model.js';

// ─── Typed errors ─────────────────────────────────────────────────────────────

export class WhisperAPIError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = 'WhisperAPIError';
  }
}

export class WhisperConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WhisperConfigError';
  }
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface WhisperTranscribeResult {
  /** Full plain-text transcript. */
  text: string;
  /** Word/sentence-level segments with timestamps. */
  segments: ITranscriptSegment[];
  /** BCP-47 language code detected by Whisper (e.g. "en"). */
  language: string;
  /** Total audio duration in seconds, if returned by the API. */
  durationSeconds?: number;
  /** Provider identifier for provenance tracking. */
  provider: 'openai-whisper';
  /** Model used (e.g. "whisper-1"). */
  model: string;
}

// ─── Whisper verbose_json segment shape (subset we use) ──────────────────────

interface VerboseSegment {
  start:   number;
  end:     number;
  text:    string;
}

interface VerboseJsonResponse {
  text:      string;
  language:  string;
  duration?: number;
  segments?: VerboseSegment[];
}

// ─── Client ───────────────────────────────────────────────────────────────────

/**
 * Thin wrapper around the OpenAI Whisper transcription API.
 *
 * Mirrors the static-class pattern used by other AI services in this codebase
 * (e.g. AIAnalysisService, ProfileAnalysisService).
 *
 * Required env vars:
 *   OPENAI_API_KEY   — OpenAI secret key
 *   WHISPER_MODEL    — model to use (default: "whisper-1")
 *
 * Optional env vars:
 *   WHISPER_LANGUAGE — BCP-47 hint (e.g. "en"). Omit to let Whisper auto-detect.
 */
// Retryable OpenAI HTTP status codes — rate limiting and transient
// server-side failures. Mirrors ColmanLLMClient's retry classification.
const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class WhisperClient {
  private static openai: OpenAI | null = null;

  private static getClient(): OpenAI {
    if (!WhisperClient.openai) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new WhisperConfigError(
          'OPENAI_API_KEY environment variable is required for Whisper transcription'
        );
      }
      WhisperClient.openai = new OpenAI({ apiKey });
    }
    return WhisperClient.openai;
  }

  private static getModel(): string {
    return process.env.WHISPER_MODEL ?? 'whisper-1';
  }

  private static getLanguageHint(): string | undefined {
    const lang = process.env.WHISPER_LANGUAGE;
    return lang && lang.trim() ? lang.trim() : undefined;
  }

  /**
   * Transcribe an audio file given its absolute local path.
   *
   * Uses `verbose_json` response format so we receive per-segment timestamps.
   * The file is streamed — it is not read fully into memory. Retries
   * transient failures (rate limits, 5xx, network errors) with exponential
   * backoff, mirroring ColmanLLMClient — transcription is the first, most
   * expensive step of the pipeline, so a single dropped connection
   * shouldn't discard the whole run.
   */
  static async transcribe(audioPath: string): Promise<WhisperTranscribeResult> {
    return WhisperClient.transcribeWithRetry(audioPath, 0);
  }

  private static async transcribeWithRetry(
    audioPath: string,
    attempt: number
  ): Promise<WhisperTranscribeResult> {
    const client = WhisperClient.getClient();
    const model  = WhisperClient.getModel();
    const lang   = WhisperClient.getLanguageHint();

    appLogger.info('[WhisperClient] Starting transcription', { model, audioPath, lang, attempt });

    try {
      // A fresh stream per attempt — a stream already consumed (or errored
      // mid-upload) by a previous attempt can't be replayed for a retry.
      const fileStream = createReadStream(audioPath);

      const createParams: Record<string, unknown> = {
        file:            fileStream,
        model,
        response_format: 'verbose_json',
        timestamp_granularities: ['segment'],
      };
      if (lang) createParams['language'] = lang;

      // The SDK's overload union doesn't cover verbose_json + timestamp_granularities
      // cleanly, so we escape through unknown before calling.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (client.audio.transcriptions.create as unknown as (
        p: Record<string, unknown>
      ) => Promise<unknown>)(createParams);

      // The SDK types verbose_json as a plain object — cast accordingly
      const verbose = response as unknown as VerboseJsonResponse;

      const segments: ITranscriptSegment[] = (verbose.segments ?? []).map((s) => ({
        start: s.start,
        end:   s.end,
        text:  s.text.trim(),
      }));

      const result: WhisperTranscribeResult = {
        text:            verbose.text?.trim() ?? '',
        segments,
        language:        verbose.language ?? 'unknown',
        durationSeconds: verbose.duration,
        provider:        'openai-whisper',
        model,
      };

      appLogger.info('[WhisperClient] Transcription completed', {
        model,
        language:       result.language,
        textLength:     result.text.length,
        segmentCount:   result.segments.length,
        durationSeconds: result.durationSeconds,
      });

      return result;

    } catch (err: unknown) {
      const isRetryableApiError =
        err instanceof OpenAI.APIError &&
        typeof err.status === 'number' &&
        RETRYABLE_STATUS_CODES.includes(err.status);
      const isRetryableNetworkError =
        err instanceof Error && !(err instanceof OpenAI.APIError) && /fetch|network|ECONNRESET|ETIMEDOUT/i.test(err.message);
      const isRetryable = isRetryableApiError || isRetryableNetworkError;

      if (isRetryable && attempt < MAX_RETRIES) {
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
        appLogger.warn('[WhisperClient] Retrying after transient failure', {
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES,
          delayMs: delay,
          error: err instanceof Error ? err.message : String(err),
        });
        await sleep(delay);
        return WhisperClient.transcribeWithRetry(audioPath, attempt + 1);
      }

      if (err instanceof OpenAI.APIError) {
        appLogger.error('[WhisperClient] OpenAI API error', {
          status:  err.status,
          message: err.message,
        });
        throw new WhisperAPIError(
          `Whisper API error (${err.status}): ${err.message}`,
          err.status ?? 500
        );
      }
      throw err;
    }
  }

  /**
   * Expose the model name for provenance tracking without calling the API.
   */
  static currentModel(): string {
    return WhisperClient.getModel();
  }
}
