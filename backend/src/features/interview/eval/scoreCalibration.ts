/**
 * Score thresholds and pass/fail determination for the interview eval.
 *
 * Centralises the success criteria from the issue:
 *   - Transcription Quality: WER < 15% on clear audio
 *   - STAR Alignment: correctly identify "Action" in >= 4/5 cases
 *   - Filler Detection: within +/- 3 words of manual count
 */

// ── Thresholds ─────────────────────────────────────────────────────

/** Maximum acceptable Word Error Rate (0.15 = 15%). */
export const WER_THRESHOLD = 0.15;

/** Minimum number of fixtures where "Action" must be detected. */
export const STAR_ACTION_MIN_DETECTIONS = 4;

/** Allowed absolute deviation in filler-word count. */
export const FILLER_TOLERANCE = 3;

// ── Types ──────────────────────────────────────────────────────────

export interface EvalPassFail {
  /** Overall pass/fail. */
  passed: boolean;
  /** Did WER meet the threshold for all fixtures? */
  werPassed: boolean;
  /** Average WER across all fixtures. */
  werAverage: number;
  /** Did STAR Action detection meet the threshold? */
  starActionPassed: boolean;
  /** Number of fixtures where Action was correctly detected. */
  starActionDetections: number;
  /** Total fixtures evaluated. */
  totalFixtures: number;
  /** Overall STAR detection accuracy (across all components). */
  starAccuracy: number;
  /** Did filler detection meet the tolerance for all fixtures? */
  fillerPassed: boolean;
  /** Number of fixtures within filler tolerance. */
  fillerWithinTolerance: number;
  /** Was calibration aligned across all fixtures? */
  calibrationAligned: boolean;
}

// ── Public API ─────────────────────────────────────────────────────

export interface FixtureResult {
  wer: number;
  actionDetected: boolean;
  starAccuracy: number;
  fillerWithinTolerance: boolean;
  fillerDelta: number;
  calibrationAligned: boolean;
}

/**
 * Determine overall pass/fail from per-fixture results.
 */
export function determinePassFail(results: FixtureResult[]): EvalPassFail {
  const total = results.length;

  // WER: all fixtures must be below threshold
  const werValues = results.map((r) => r.wer);
  const werAverage = werValues.reduce((a, b) => a + b, 0) / total;
  const werPassed = werValues.every((w) => w < WER_THRESHOLD);

  // STAR Action: at least STAR_ACTION_MIN_DETECTIONS fixtures
  const starActionDetections = results.filter((r) => r.actionDetected).length;
  const starActionPassed = starActionDetections >= STAR_ACTION_MIN_DETECTIONS;

  // STAR overall accuracy
  const starAccuracy = results.reduce((a, r) => a + r.starAccuracy, 0) / total;

  // Filler: all fixtures within tolerance
  const fillerWithinTolerance = results.filter((r) => r.fillerWithinTolerance).length;
  const fillerPassed = fillerWithinTolerance === total;

  // Calibration: all fixtures aligned
  const calibrationAligned = results.every((r) => r.calibrationAligned);

  const passed = werPassed && starActionPassed && fillerPassed;

  return {
    passed,
    werPassed,
    werAverage,
    starActionPassed,
    starActionDetections,
    totalFixtures: total,
    starAccuracy,
    fillerPassed,
    fillerWithinTolerance,
    calibrationAligned,
  };
}
