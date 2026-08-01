/**
 * STAR label accuracy evaluator.
 *
 * Compares predicted STAR segment labels against a ground-truth STAR map.
 * For each ground-truth segment, checks whether the predicted labels overlap
 * sufficiently (IoU-based or label-match at word level).
 *
 * Two evaluation modes:
 *   1. **Per-component detection** — does the prediction detect each STAR
 *      component at all? (binary yes/no per component)
 *   2. **Segment overlap accuracy** — how well do predicted word ranges
 *      align with ground-truth ranges? (IoU per segment)
 */

import type { StarLabel, StarSegment } from './fixtures.js';

// ── Types ──────────────────────────────────────────────────────────

export interface StarComponentResult {
  label: StarLabel;
  detected: boolean;
  /** Intersection-over-Union of word ranges (0-1). null when not detected. */
  iou: number | null;
}

export interface StarAccuracyResult {
  /** Per-component results. */
  components: StarComponentResult[];
  /** Number of ground-truth components correctly detected. */
  detectedCount: number;
  /** Total ground-truth components. */
  totalExpected: number;
  /** Overall detection accuracy (detectedCount / totalExpected). */
  accuracy: number;
  /** Average IoU across detected components (ignores undetected). */
  averageIou: number;
  /** Whether the "action" component was correctly detected. */
  actionDetected: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────

/** Compute IoU of two word-index ranges [start, end] (inclusive). */
function rangeIou(
  a: { startWord: number; endWord: number },
  b: { startWord: number; endWord: number }
): number {
  const interStart = Math.max(a.startWord, b.startWord);
  const interEnd = Math.min(a.endWord, b.endWord);
  const intersection = Math.max(0, interEnd - interStart + 1);

  const unionStart = Math.min(a.startWord, b.startWord);
  const unionEnd = Math.max(a.endWord, b.endWord);
  const union = unionEnd - unionStart + 1;

  return union === 0 ? 0 : intersection / union;
}

/**
 * Find the best matching predicted segment for a given ground-truth segment.
 * "Best" = same label + highest IoU.
 */
function findBestMatch(
  truth: StarSegment,
  predictions: StarSegment[]
): { segment: StarSegment; iou: number } | null {
  let best: { segment: StarSegment; iou: number } | null = null;

  for (const pred of predictions) {
    if (pred.label !== truth.label) continue;
    const iou = rangeIou(truth, pred);
    if (iou > 0 && (!best || iou > best.iou)) {
      best = { segment: pred, iou };
    }
  }

  return best;
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Evaluate STAR label accuracy by comparing predicted segments against
 * the ground-truth STAR map.
 *
 * @param truthMap   Ground-truth segments (from fixture).
 * @param predicted  Predicted segments (from the AI pipeline).
 */
export function evaluateStarAccuracy(
  truthMap: StarSegment[],
  predicted: StarSegment[]
): StarAccuracyResult {
  const components: StarComponentResult[] = [];

  for (const truth of truthMap) {
    const match = findBestMatch(truth, predicted);
    components.push({
      label: truth.label,
      detected: match !== null,
      iou: match ? match.iou : null,
    });
  }

  const detectedCount = components.filter((c) => c.detected).length;
  const totalExpected = truthMap.length;
  const accuracy = totalExpected === 0 ? 1 : detectedCount / totalExpected;

  const ious = components.filter((c) => c.iou !== null).map((c) => c.iou as number);
  const averageIou = ious.length === 0 ? 0 : ious.reduce((a, b) => a + b, 0) / ious.length;

  const actionDetected = components.some((c) => c.label === 'action' && c.detected);

  return {
    components,
    detectedCount,
    totalExpected,
    accuracy,
    averageIou,
    actionDetected,
  };
}
