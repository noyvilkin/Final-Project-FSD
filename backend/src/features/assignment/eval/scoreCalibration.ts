/** Checks the AI's scores and grade fall inside the per-fixture expected windows. */

import type { AIAnalysisResult } from '../services/aiAnalysisService.js';
import type { PackageFixture } from './fixtures.js';

export interface ScoreCalibrationResult {
  functionalInRange: boolean;
  functionalActual: number;
  functionalExpected: { min: number; max: number };

  codeQualityInRange: boolean;
  codeQualityActual: number;
  codeQualityExpected: { min: number; max: number };

  gradeMatches: boolean;
  gradeActual: string;
  gradeExpected: string[];

  allInRange: boolean;
}

function inRange(actual: number, range: { min: number; max: number }): boolean {
  return actual >= range.min && actual <= range.max;
}

export function checkScoreCalibration(
  fixture: PackageFixture,
  feedback: NonNullable<AIAnalysisResult['feedback']>
): ScoreCalibrationResult {
  const functionalActual = feedback.functionalCorrectness.score;
  const codeQualityActual = feedback.codeQuality.score;
  const gradeActual = feedback.overall.grade;

  const functionalInRange = inRange(functionalActual, fixture.functionalCorrectnessRange);
  const codeQualityInRange = inRange(codeQualityActual, fixture.codeQualityRange);
  const gradeMatches = fixture.expectedGrades.includes(gradeActual);

  return {
    functionalInRange,
    functionalActual,
    functionalExpected: fixture.functionalCorrectnessRange,

    codeQualityInRange,
    codeQualityActual,
    codeQualityExpected: fixture.codeQualityRange,

    gradeMatches,
    gradeActual,
    gradeExpected: fixture.expectedGrades,

    allInRange: functionalInRange && codeQualityInRange && gradeMatches,
  };
}
