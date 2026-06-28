/**
 * Behavioral calibration checker.
 *
 * Verifies that the AI's overall confidence score is consistent with
 * the observable metrics (pacing, filler-word density, STAR completeness).
 *
 * Heuristic: a high confidence score should correlate with:
 *   - Low filler-word rate (< 5/min)
 *   - Comfortable pacing (120-160 WPM)
 *   - Complete STAR coverage (all 4 components detected)
 *
 * Conversely, a low score should correlate with high fillers, extreme
 * pacing, or missing STAR components.
 */

// ── Types ──────────────────────────────────────────────────────────

export interface CalibrationInput {
  /** AI-assigned overall confidence / quality score (0-100). */
  overallScore: number;
  /** Filler words per minute. */
  fillerRatePerMinute: number;
  /** Words per minute (pacing). */
  pacingWpm: number;
  /** Number of STAR components detected out of expected. */
  starComponentsDetected: number;
  /** Total expected STAR components. */
  starComponentsExpected: number;
}

export interface CalibrationResult {
  /** Whether the score is directionally consistent with the metrics. */
  aligned: boolean;
  /** Individual alignment checks. */
  checks: {
    fillerRateAligned: boolean;
    pacingAligned: boolean;
    starCoverageAligned: boolean;
  };
  /** Human-readable explanation of any misalignment. */
  notes: string[];
}

// ── Thresholds ─────────────────────────────────────────────────────

const HIGH_SCORE_THRESHOLD = 70;
const LOW_SCORE_THRESHOLD = 40;

const LOW_FILLER_RATE = 5;     // fillers/min — below this is "clean"
const HIGH_FILLER_RATE = 12;   // above this is "filler-heavy"

const PACING_COMFORTABLE_MIN = 110;
const PACING_COMFORTABLE_MAX = 170;

// ── Public API ─────────────────────────────────────────────────────

/**
 * Check whether the AI's confidence score is calibrated with
 * observable speech metrics.
 */
export function checkCalibration(input: CalibrationInput): CalibrationResult {
  const notes: string[] = [];
  const isHighScore = input.overallScore >= HIGH_SCORE_THRESHOLD;
  const isLowScore = input.overallScore <= LOW_SCORE_THRESHOLD;

  // ── Filler rate alignment ──
  const lowFillers = input.fillerRatePerMinute < LOW_FILLER_RATE;
  const highFillers = input.fillerRatePerMinute >= HIGH_FILLER_RATE;

  let fillerRateAligned = true;
  if (isHighScore && highFillers) {
    fillerRateAligned = false;
    notes.push(
      `High score (${input.overallScore}) but high filler rate (${input.fillerRatePerMinute}/min)`
    );
  }
  if (isLowScore && lowFillers && input.fillerRatePerMinute === 0) {
    // Low score with zero fillers might still be valid (e.g., missing STAR components)
    // so we only flag if fillers are literally zero AND all STAR components present
    if (input.starComponentsDetected === input.starComponentsExpected) {
      fillerRateAligned = false;
      notes.push(
        `Low score (${input.overallScore}) but zero fillers and complete STAR coverage`
      );
    }
  }

  // ── Pacing alignment ──
  const comfortablePacing =
    input.pacingWpm >= PACING_COMFORTABLE_MIN &&
    input.pacingWpm <= PACING_COMFORTABLE_MAX;

  let pacingAligned = true;
  if (isHighScore && !comfortablePacing) {
    pacingAligned = false;
    notes.push(
      `High score (${input.overallScore}) but pacing outside comfortable range (${input.pacingWpm} WPM)`
    );
  }

  // ── STAR coverage alignment ──
  const fullStarCoverage = input.starComponentsDetected === input.starComponentsExpected;
  const starRatio =
    input.starComponentsExpected === 0
      ? 1
      : input.starComponentsDetected / input.starComponentsExpected;

  let starCoverageAligned = true;
  if (isHighScore && starRatio < 0.75) {
    starCoverageAligned = false;
    notes.push(
      `High score (${input.overallScore}) but only ${input.starComponentsDetected}/${input.starComponentsExpected} STAR components detected`
    );
  }
  if (isLowScore && fullStarCoverage && lowFillers && comfortablePacing) {
    starCoverageAligned = false;
    notes.push(
      `Low score (${input.overallScore}) but all metrics are clean — possible miscalibration`
    );
  }

  const aligned = fillerRateAligned && pacingAligned && starCoverageAligned;

  return {
    aligned,
    checks: {
      fillerRateAligned,
      pacingAligned,
      starCoverageAligned,
    },
    notes,
  };
}
