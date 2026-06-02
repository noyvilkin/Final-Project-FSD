/**
 * Semantic Audit Assertions Framework
 * 
 * Validates AI semantic auditing performance by checking:
 * - Violation detection (primary + secondary)
 * - Score accuracy vs. requirement fulfillment
 * - Feedback quality and actionability
 */

export interface AssertionResult {
  passed: boolean;
  message: string;
  details?: Record<string, any>;
}

export interface DetectionResult {
  primary: AssertionResult;
  secondary: AssertionResult;
  scoring: AssertionResult;
  overall: {
    passed: boolean;
    strength: 'excellent' | 'good' | 'partial' | 'fail';
    score: number; // 0-100
  };
}

export class SemanticAuditAssertions {
  /**
   * Assert that a violation was detected in AI feedback
   */
  static assertViolationDetected(
    packageId: string,
    feedbackText: string,
    violationKeywords: string[],
    context: string
  ): AssertionResult {
    console.log(`[ASSERT] Checking if violation detected in ${packageId}: ${violationKeywords.join(', ')}`);

    const feedbackLower = feedbackText.toLowerCase();
    const foundKeywords = violationKeywords.filter(keyword =>
      feedbackLower.includes(keyword.toLowerCase())
    );

    const passed = foundKeywords.length > 0;
    const message = passed
      ? `✓ Violation detected: ${foundKeywords.join(', ')}`
      : `✗ Violation NOT detected. Expected keywords: ${violationKeywords.join(', ')}`;

    console.log(`  → ${message}`);

    return {
      passed,
      message,
      details: {
        context,
        foundKeywords,
        missingKeywords: violationKeywords.filter(k => !foundKeywords.includes(k)),
        violationStrength: (foundKeywords.length / violationKeywords.length) * 100
      }
    };
  }

  /**
   * Assert functional correctness score is within expected range
   */
  static assertFunctionalCorrectnessScore(
    packageId: string,
    actualScore: number,
    minScore: number,
    maxScore: number
  ): AssertionResult {
    console.log(`[ASSERT] Functional Correctness for ${packageId}: ${actualScore}% (expected ${minScore}-${maxScore}%)`);

    const passed = actualScore >= minScore && actualScore <= maxScore;
    const message = passed
      ? `✓ Score ${actualScore}% within range [${minScore}, ${maxScore}]`
      : `✗ Score ${actualScore}% outside range [${minScore}, ${maxScore}]`;

    console.log(`  → ${message}`);

    return {
      passed,
      message,
      details: {
        actualScore,
        expectedRange: { min: minScore, max: maxScore },
        deviation: actualScore < minScore ? 'too_low' : 'too_high',
        deviationAmount: Math.max(
          actualScore < minScore ? minScore - actualScore : 0,
          actualScore > maxScore ? actualScore - maxScore : 0
        )
      }
    };
  }

  /**
   * Assert code quality score expectations
   */
  static assertCodeQualityScore(
    packageId: string,
    actualScore: number,
    expectedRange: { min: number; max: number }
  ): AssertionResult {
    console.log(`[ASSERT] Code Quality for ${packageId}: ${actualScore}% (expected ${expectedRange.min}-${expectedRange.max}%)`);

    const passed = actualScore >= expectedRange.min && actualScore <= expectedRange.max;
    const message = passed
      ? `✓ Code Quality ${actualScore}% within range`
      : `✗ Code Quality ${actualScore}% outside expected range`;

    console.log(`  → ${message}`);

    return {
      passed,
      message,
      details: {
        actualScore,
        expectedRange,
        withinExpectation: passed
      }
    };
  }

  /**
   * Assert overall grade matches severity of violations
   */
  static assertGradeMatchesViolation(
    packageId: string,
    actualGrade: string,
    expectedGrades: string[] // e.g., ['F', 'D'] for critical violations
  ): AssertionResult {
    console.log(`[ASSERT] Grade for ${packageId}: ${actualGrade} (expected: ${expectedGrades.join(' or ')})`);

    const passed = expectedGrades.includes(actualGrade);
    const message = passed
      ? `✓ Grade ${actualGrade} matches expected severity`
      : `✗ Grade ${actualGrade} doesn't match expected (${expectedGrades.join(' or ')})`;

    console.log(`  → ${message}`);

    return {
      passed,
      message,
      details: {
        actualGrade,
        expectedGrades,
        severity: expectedGrades.length <= 1 ? 'critical' : 'moderate'
      }
    };
  }

  /**
   * Assert that a secondary violation is mentioned (harder to detect)
   */
  static assertSecondaryViolationDetected(
    packageId: string,
    feedbackText: string,
    secondaryKeywords: string[],
    context: string
  ): AssertionResult {
    console.log(`[ASSERT] Secondary violation check for ${packageId}: ${secondaryKeywords.join(', ')}`);

    const feedbackLower = feedbackText.toLowerCase();
    const foundKeywords = secondaryKeywords.filter(keyword =>
      feedbackLower.includes(keyword.toLowerCase())
    );

    // Secondary violations are "nice to have" - not required for pass
    const message = foundKeywords.length > 0
      ? `✓ BONUS: Secondary violation detected: ${foundKeywords.join(', ')}`
      : `⚠ Secondary violation NOT detected (OK if primary was caught)`;

    console.log(`  → ${message}`);

    return {
      passed: foundKeywords.length > 0,
      message,
      details: {
        context,
        foundKeywords,
        missingKeywords: secondaryKeywords.filter(k => !foundKeywords.includes(k)),
        detectionRate: (foundKeywords.length / secondaryKeywords.length) * 100,
        isBonus: true
      }
    };
  }

  /**
   * Assert that non-source files are filtered out (noise reduction)
   */
  static assertNoiseFiltered(
    packageId: string,
    sourceFilesIncluded: string[],
    nonSourceFilesIncluded: string[]
  ): AssertionResult {
    console.log(`[ASSERT] Noise filtering for ${packageId}: ${sourceFilesIncluded.length} source, ${nonSourceFilesIncluded.length} non-source`);

    const passed = nonSourceFilesIncluded.length === 0;
    const message = passed
      ? `✓ No non-source files (node_modules, .git, dist) found`
      : `✗ Non-source files not filtered: ${nonSourceFilesIncluded.join(', ')}`;

    console.log(`  → ${message}`);

    return {
      passed,
      message,
      details: {
        sourceFileCount: sourceFilesIncluded.length,
        nonSourceFileCount: nonSourceFilesIncluded.length,
        nonSourceFiles: nonSourceFilesIncluded,
        filteringSuccess: passed ? 100 : (sourceFilesIncluded.length / (sourceFilesIncluded.length + nonSourceFilesIncluded.length)) * 100
      }
    };
  }

  /**
   * Assert feedback contains actionable suggestions
   */
  static assertActionableFeedback(
    packageId: string,
    improvements: string[]
  ): AssertionResult {
    console.log(`[ASSERT] Feedback actionability for ${packageId}: ${improvements.length} suggestions`);

    const hasDetails = improvements.filter(i => i.length > 20).length;
    const passed = improvements.length > 0 && hasDetails > 0;
    const message = passed
      ? `✓ Feedback includes ${improvements.length} actionable suggestions`
      : `✗ Feedback lacks actionable suggestions`;

    console.log(`  → ${message}`);

    return {
      passed,
      message,
      details: {
        suggestionCount: improvements.length,
        detailedSuggestions: hasDetails,
        avgSuggestionLength: improvements.reduce((a, b) => a + b.length, 0) / improvements.length,
        suggestions: improvements.slice(0, 3) // Show first 3 for debugging
      }
    };
  }

  /**
   * Assert no false positives (doesn't flag issues that don't exist)
   */
  static assertNoFalsePositives(
    packageId: string,
    flaggedIssues: string[],
    knownNonIssues: string[]
  ): AssertionResult {
    console.log(`[ASSERT] False positives check for ${packageId}`);

    const falsePositives = flaggedIssues.filter(issue =>
      knownNonIssues.some(nonIssue => issue.toLowerCase().includes(nonIssue.toLowerCase()))
    );

    const passed = falsePositives.length === 0;
    const message = passed
      ? `✓ No false positives detected`
      : `✗ Found ${falsePositives.length} false positive(s): ${falsePositives.join(', ')}`;

    console.log(`  → ${message}`);

    return {
      passed,
      message,
      details: {
        falsePositiveCount: falsePositives.length,
        falsePositives,
        accuracyRate: ((flaggedIssues.length - falsePositives.length) / flaggedIssues.length * 100) || 100
      }
    };
  }

  /**
   * Calculate overall detection result for a package
   */
  static calculateDetectionStrength(
    primaryPassed: boolean,
    primaryScore: number,
    secondaryPassed: boolean,
    scoringPassed: boolean,
    feedbackActionable: boolean
  ): DetectionResult {
    console.log(`[CALC] Computing detection strength...`);

    // Scoring logic
    let score = 0;
    if (primaryPassed) score += 40; // Primary violation caught is critical
    if (primaryScore >= 80) score += 20; // Score accuracy
    if (secondaryPassed) score += 20; // Secondary bonus
    if (scoringPassed) score += 10; // Grade accuracy
    if (feedbackActionable) score += 10; // Feedback quality

    const overall = {
      passed: primaryPassed && scoringPassed,
      strength:
        score >= 90 ? 'excellent'
        : score >= 70 ? 'good'
        : score >= 50 ? 'partial'
        : 'fail',
      score
    };

    console.log(`  → Strength: ${overall.strength} (${score}/100)`);

    return {
      primary: { passed: primaryPassed, message: `Primary violation ${primaryPassed ? 'detected' : 'missed'}` },
      secondary: { passed: secondaryPassed, message: `Secondary violation ${secondaryPassed ? 'detected' : 'not detected (OK)'}` },
      scoring: { passed: scoringPassed, message: `Scoring ${scoringPassed ? 'accurate' : 'inaccurate'}` },
      overall
    };
  }
}

export default SemanticAuditAssertions;
