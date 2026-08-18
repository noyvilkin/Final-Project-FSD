/**
 * Live sanity-check evaluator for real-audio fixtures (audioFixtures.ts).
 *
 * Unlike liveStarCheck.ts (which grades against a hand-authored STAR map for
 * synthetic single-answer fixtures), a real multi-topic Q&A recording has no
 * clean situation/task/action/result ground truth to grade against. This
 * checks plausibility and schema health instead: did the model produce a
 * well-formed, non-degenerate result, and did it correctly focus on the
 * candidate rather than the interviewer in a two-speaker transcript.
 */

import type { AudioFixture } from './audioFixtures.js';
import type { LLMInsightsResult } from '../services/llmInsightsService.js';

const MIN_PLAUSIBLE_SCORE = 10;
const MAX_PLAUSIBLE_SCORE = 95;

export interface AudioLiveCheckResult {
  confidenceScore: number;
  scoreIsPlausible: boolean;
  personalAgency: {
    expected: boolean;
    actual: boolean;
    correct: boolean;
  };
  hasCoachingContent: boolean;
  starSectionsNonEmpty: boolean;
  passed: boolean;
}

export function evaluateAudioLive(
  fixture: AudioFixture,
  result: LLMInsightsResult
): AudioLiveCheckResult {
  // A confidence score pinned exactly at 0 or 100 on a real, imperfect
  // recording is more likely a degenerate/lazy output than a genuine
  // judgment — treat the extremes as implausible.
  const scoreIsPlausible =
    result.confidenceScore >= MIN_PLAUSIBLE_SCORE &&
    result.confidenceScore <= MAX_PLAUSIBLE_SCORE;

  const personalAgency = {
    expected: fixture.expectCandidatePersonalAgency,
    actual: result.candidateActionAssessment.usesPersonalAgency,
    correct:
      fixture.expectCandidatePersonalAgency === result.candidateActionAssessment.usesPersonalAgency,
  };

  const hasCoachingContent =
    result.strengths.length > 0 &&
    result.weaknesses.length > 0 &&
    result.recommendations.length > 0;

  const starSectionsNonEmpty = (['situation', 'task', 'action', 'result'] as const).every(
    (label) => result.starAnalysis[label]?.text?.trim().length > 0
  );

  const passed =
    scoreIsPlausible && personalAgency.correct && hasCoachingContent && starSectionsNonEmpty;

  return {
    confidenceScore: result.confidenceScore,
    scoreIsPlausible,
    personalAgency,
    hasCoachingContent,
    starSectionsNonEmpty,
    passed,
  };
}
