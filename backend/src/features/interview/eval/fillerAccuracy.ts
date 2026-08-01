/**
 * Filler-word detection accuracy evaluator.
 *
 * Compares the predicted filler word counts from the AI pipeline against
 * ground-truth counts from the fixture.  The success criterion is:
 *   |predicted_total - truth_total| <= TOLERANCE  (default +-3)
 */

import type { FillerWordsSummary } from './fixtures.js';

// ── Types ──────────────────────────────────────────────────────────

export interface FillerAccuracyResult {
  /** Absolute delta: |predicted - truth|. */
  delta: number;
  /** Whether delta is within the allowed tolerance. */
  withinTolerance: boolean;
  /** The tolerance used. */
  tolerance: number;
  /** Ground-truth total count. */
  expectedCount: number;
  /** Predicted total count. */
  actualCount: number;
  /** Per-word breakdown (only for words present in either truth or prediction). */
  perWord: Array<{
    word: string;
    expected: number;
    actual: number;
    delta: number;
  }>;
}

// ── Public API ─────────────────────────────────────────────────────

const DEFAULT_TOLERANCE = 3;

/**
 * Evaluate filler-word detection accuracy.
 *
 * @param truth      Ground-truth filler word summary.
 * @param predicted  Predicted filler word summary from the pipeline.
 * @param tolerance  Allowed absolute deviation (default 3).
 */
export function evaluateFillerAccuracy(
  truth: FillerWordsSummary,
  predicted: FillerWordsSummary,
  tolerance: number = DEFAULT_TOLERANCE
): FillerAccuracyResult {
  const delta = Math.abs(predicted.totalCount - truth.totalCount);

  // Build per-word map
  const wordMap = new Map<string, { expected: number; actual: number }>();

  for (const tw of truth.examples) {
    const key = tw.word.toLowerCase();
    wordMap.set(key, { expected: tw.count, actual: 0 });
  }

  for (const pw of predicted.examples) {
    const key = pw.word.toLowerCase();
    const existing = wordMap.get(key);
    if (existing) {
      existing.actual = pw.count;
    } else {
      wordMap.set(key, { expected: 0, actual: pw.count });
    }
  }

  const perWord = Array.from(wordMap.entries()).map(([word, counts]) => ({
    word,
    expected: counts.expected,
    actual: counts.actual,
    delta: Math.abs(counts.actual - counts.expected),
  }));

  return {
    delta,
    withinTolerance: delta <= tolerance,
    tolerance,
    expectedCount: truth.totalCount,
    actualCount: predicted.totalCount,
    perWord,
  };
}
