/**
 * Live STAR/confidence evaluator — compares a REAL LLMInsightsService.analyse()
 * call against fixture ground truth.
 *
 * Unlike starAccuracy.ts (which does IoU boundary matching against a
 * synthetic prediction), this has no timestamps to compare — these text
 * fixtures were never run through Whisper, so the live LLM call always
 * returns start/end: null. Presence is checked instead via each STAR
 * component's score: a component present in fixture.starMap should score
 * reasonably high; a component fixture.starMap deliberately omits (the
 * candidate's answer genuinely lacked it) should score low. This is a
 * weaker signal than IoU, but it's a REAL one — the previous synthetic
 * perturbation could never disagree with itself by construction.
 */

import type { InterviewFixture, StarLabel } from './fixtures.js';
import type { LLMInsightsResult } from '../services/llmInsightsService.js';

const STAR_LABELS: StarLabel[] = ['situation', 'task', 'action', 'result'];

/** A component ground-truthed as present should score at or above this. */
const PRESENT_SCORE_FLOOR = 50;
/** A component ground-truthed as absent/weak should score below this. */
const ABSENT_SCORE_CEILING = 50;

export interface LiveComponentCheck {
  label: StarLabel;
  expectedPresent: boolean;
  llmScore: number;
  correct: boolean;
}

export interface LiveStarCheckResult {
  confidenceScore: number;
  scoreInRange: boolean;
  expectedScoreRange: { min: number; max: number };
  components: LiveComponentCheck[];
  componentAccuracy: number;
  teamLanguage: {
    expected: boolean;
    actual: boolean;
    correct: boolean;
  };
  /** Non-empty strengths/weaknesses/recommendations — a basic sanity check
   *  that the model didn't return degenerate/empty coaching output. */
  hasCoachingContent: boolean;
  passed: boolean;
}

export function evaluateLiveStar(
  fixture: InterviewFixture,
  result: LLMInsightsResult
): LiveStarCheckResult {
  const scoreInRange =
    result.confidenceScore >= fixture.expectedScoreRange.min &&
    result.confidenceScore <= fixture.expectedScoreRange.max;

  const components: LiveComponentCheck[] = STAR_LABELS.map((label) => {
    const expectedPresent = fixture.starMap.some((s) => s.label === label);
    const llmScore = result.starAnalysis[label]?.score ?? 0;
    const correct = expectedPresent
      ? llmScore >= PRESENT_SCORE_FLOOR
      : llmScore < ABSENT_SCORE_CEILING;
    return { label, expectedPresent, llmScore, correct };
  });

  const componentAccuracy =
    components.filter((c) => c.correct).length / components.length;

  const teamLanguage = {
    expected: fixture.expectedTeamOnlyLanguage,
    actual: result.candidateActionAssessment.teamLanguageDetected,
    correct:
      fixture.expectedTeamOnlyLanguage === result.candidateActionAssessment.teamLanguageDetected,
  };

  const hasCoachingContent =
    result.strengths.length > 0 &&
    result.weaknesses.length > 0 &&
    result.recommendations.length > 0;

  const passed =
    scoreInRange && componentAccuracy >= 0.75 && teamLanguage.correct && hasCoachingContent;

  return {
    confidenceScore: result.confidenceScore,
    scoreInRange,
    expectedScoreRange: fixture.expectedScoreRange,
    components,
    componentAccuracy,
    teamLanguage,
    hasCoachingContent,
    passed,
  };
}
