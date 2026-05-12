import type {
  IAnalyzerOutputs,
  IReadinessOutput,
} from "../models/interviewInsights.model.js";

// ---------------------------------------------------------------------------
// Tunable weights — keep at the top so coaches can adjust easily.
// ---------------------------------------------------------------------------

const TECHNICAL_FROM_ACCURACY_WEIGHT     = 0.4;
const TECHNICAL_FROM_RELEVANCE_WEIGHT    = 0.6;

const COMMUNICATION_CONFIDENCE_WEIGHT    = 0.5;
const COMMUNICATION_FLUENCY_WEIGHT       = 0.5;

const READINESS_TECHNICAL_WEIGHT         = 0.4;
const READINESS_BEHAVIORAL_WEIGHT        = 0.25;
const READINESS_COMMUNICATION_WEIGHT     = 0.35;

// ---------------------------------------------------------------------------
// computeReadiness
// ---------------------------------------------------------------------------

/**
 * computeReadiness — turns Mission 02 analyzer outputs into the canonical
 * "Interview Readiness Score". Each component is clamped to 0..100 and the
 * weighted sum is bounded to 0..100.
 *
 * Components:
 *   technical     = 0.4 * contentQuality.technicalAccuracy
 *                 + 0.6 * contentQuality.professionalRelevance
 *   behavioral    = starAlignment.starAlignmentScore
 *   communication = 0.5 * confidence.confidenceScore
 *                 + 0.5 * confidence.fluencyScore
 *
 *   readinessScore = 0.4  * technical
 *                  + 0.25 * behavioral
 *                  + 0.35 * communication
 */
export function computeReadiness(analyzers: IAnalyzerOutputs): IReadinessOutput {
  const technical = clamp(
    TECHNICAL_FROM_ACCURACY_WEIGHT  * (analyzers.contentQuality?.technicalAccuracy     ?? 0) +
    TECHNICAL_FROM_RELEVANCE_WEIGHT * (analyzers.contentQuality?.professionalRelevance ?? 0),
    0, 100
  );

  const behavioral = clamp(analyzers.starAlignment?.starAlignmentScore ?? 0, 0, 100);

  const communication = clamp(
    COMMUNICATION_CONFIDENCE_WEIGHT * (analyzers.confidence?.confidenceScore ?? 0) +
    COMMUNICATION_FLUENCY_WEIGHT    * (analyzers.confidence?.fluencyScore    ?? 0),
    0, 100
  );

  const readinessScore = clamp(
    READINESS_TECHNICAL_WEIGHT     * technical    +
    READINESS_BEHAVIORAL_WEIGHT    * behavioral   +
    READINESS_COMMUNICATION_WEIGHT * communication,
    0, 100
  );

  return {
    readinessScore: round2(readinessScore),
    breakdown: {
      technical:     round2(technical),
      behavioral:    round2(behavioral),
      communication: round2(communication),
    },
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
