import type { ITranscriptSegment } from '../models/interviewInsights.model.js';

// ─── Result type ──────────────────────────────────────────────────────────────

export interface PacingResult {
  wordsPerMinute:                  number;
  estimatedSpeakingDurationSeconds: number;
  totalWordCount:                  number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Deterministic pacing calculator.
 *
 * Duration resolution order (most accurate → least):
 *   1. Derived from transcript segments (last segment end − first segment start)
 *   2. mediaDurationSeconds from the interview record
 *   3. Rough word-count estimate (100 wpm baseline) when nothing else is available
 *
 * Pure function — no I/O, fully unit-testable.
 */
export class PacingService {
  /**
   * Calculate WPM and estimated speaking duration.
   *
   * @param transcript           Plain-text transcript.
   * @param segments             Timestamped segments from Whisper (may be empty).
   * @param mediaDurationSeconds Total media duration fallback (may be undefined).
   */
  static calculate(
    transcript: string,
    segments:   ITranscriptSegment[] = [],
    mediaDurationSeconds?: number
  ): PacingResult {
    const totalWordCount = PacingService.countWords(transcript);

    const durationSeconds = PacingService.resolveDuration(segments, mediaDurationSeconds);

    // Guard against divide-by-zero
    if (durationSeconds <= 0 || totalWordCount === 0) {
      return { wordsPerMinute: 0, estimatedSpeakingDurationSeconds: durationSeconds, totalWordCount };
    }

    const wordsPerMinute = Math.round((totalWordCount / durationSeconds) * 60);

    return { wordsPerMinute, estimatedSpeakingDurationSeconds: durationSeconds, totalWordCount };
  }

  // ── private ──────────────────────────────────────────────────────────────

  /** Count words by splitting on whitespace runs. */
  private static countWords(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  /**
   * Resolve the best available speaking duration in seconds.
   *
   * Priority:
   *   1. Segment span (end of last segment − start of first segment)
   *   2. mediaDurationSeconds
   *   3. 0 (caller must guard against this)
   */
  private static resolveDuration(
    segments:             ITranscriptSegment[],
    mediaDurationSeconds?: number
  ): number {
    if (segments.length > 0) {
      const first = segments[0];
      const last  = segments[segments.length - 1];
      if (first && last) {
        const span = last.end - first.start;
        if (span > 0) return span;
      }
    }

    if (typeof mediaDurationSeconds === 'number' && mediaDurationSeconds > 0) {
      return mediaDurationSeconds;
    }

    return 0;
  }
}
