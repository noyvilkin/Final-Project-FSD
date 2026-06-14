/** Primary + secondary violation detection — substring match against per-fixture keyword lists. */

import type { AIAnalysisResult } from '../services/aiAnalysisService.js';
import type { PackageFixture } from './fixtures.js';

export interface ViolationDetectionResult {
  primaryDetected: boolean;
  primaryMatchedKeywords: string[];
  secondaryDetected: boolean;
  secondaryMatchedKeywords: string[];
  feedbackText: string;
}

export function flattenFeedbackText(feedback: NonNullable<AIAnalysisResult['feedback']>): string {
  const parts: string[] = [
    feedback.overall.summary || '',
    ...(feedback.codeQuality.weaknesses || []),
    ...(feedback.codeQuality.strengths || []),
    ...(feedback.functionalCorrectness.missingFeatures || []),
    ...(feedback.bestPractices.suggestions || []),
  ];
  return parts.join(' \n ').toLowerCase();
}

function findMatches(haystack: string, keywords: string[]): string[] {
  const matched: string[] = [];
  for (const kw of keywords) {
    if (kw.trim().length === 0) continue;
    if (haystack.includes(kw.toLowerCase())) matched.push(kw);
  }
  return matched;
}

export function detectViolations(
  fixture: PackageFixture,
  feedback: NonNullable<AIAnalysisResult['feedback']>
): ViolationDetectionResult {
  const feedbackText = flattenFeedbackText(feedback);

  const primaryMatches = findMatches(feedbackText, fixture.primaryKeywords);
  const secondaryMatches = fixture.secondaryKeywords
    ? findMatches(feedbackText, fixture.secondaryKeywords)
    : [];

  return {
    primaryDetected: primaryMatches.length > 0,
    primaryMatchedKeywords: primaryMatches,
    secondaryDetected: secondaryMatches.length > 0,
    secondaryMatchedKeywords: secondaryMatches,
    feedbackText,
  };
}
