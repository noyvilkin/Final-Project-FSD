/**
 * Semantic Audit Test Runner
 * 
 * Executes all 6 test packages through AI semantic auditing
 * Captures structured results for analysis
 * Uses console.log for debugging only
 */

import fs from 'fs';
import path from 'path';
import { AssignmentAnalysisService } from '../services/assignmentAnalysisService.js';
import { AIAnalysisService } from '../services/aiAnalysisService.js';
import { ZipProcessor } from '../../../common/utils/zipProcessor.js';
import { appLogger } from '../../../common/services/logger.js';
import SemanticAuditAssertions, { DetectionResult } from './semanticAuditAssertions.js';

interface PackageTestConfig {
  id: string;
  name: string;
  path: string;
  violationKey: string;
  violationDescription: string;
  secondaryViolation?: string;
  primaryKeywords: string[];
  secondaryKeywords?: string[];
  expectedFunctionalCorrectnessRange: { min: number; max: number };
  expectedCodeQualityRange: { min: number; max: number };
  expectedGrades: string[];
  description: string;
}

interface TestRunResult {
  packageId: string;
  packageName: string;
  timestamp: string;
  execution: {
    success: boolean;
    error?: string;
    zipProcessingTime: number;
    analysisTime: number;
    aiAnalysisTime: number;
    totalTime: number;
  };
  rawData: {
    fileCount: number;
    totalLines: number;
    detectedLanguages: string[];
    detectedFrameworks: string[];
  };
  aiFeedback?: {
    functionalCorrectness: {
      score: number;
      meetsRequirements: boolean;
      missingFeatures: string[];
    };
    codeQuality: {
      score: number;
      strengths: string[];
      weaknesses: string[];
    };
    overall: {
      score: number;
      grade: string;
      summary: string;
    };
  };
  detectionAnalysis: DetectionResult;
  testResult: {
    passed: boolean;
    strength: 'excellent' | 'good' | 'partial' | 'fail';
    score: number;
    notes: string;
  };
}

interface TestRunSummary {
  timestamp: string;
  totalPackages: number;
  results: TestRunResult[];
  summary: {
    totalPassed: number;
    totalFailed: number;
    detectionRate: number;
    secondaryDetectionRate: number;
    averageScore: number;
    strengths: string[];
    weaknesses: string[];
  };
}

export class SemanticAuditTestRunner {
  private static readonly PACKAGES_BASE_PATH = path.join(
    process.cwd(),
    'backend/src/features/assignment/tests/faulty-packages'
  );

  private static readonly TEST_CONFIGS: Record<string, PackageTestConfig> = {
    'pkg-01': {
      id: 'pkg-01',
      name: 'package-01',
      path: path.join(SemanticAuditTestRunner.PACKAGES_BASE_PATH, 'package-01'),
      violationKey: 'wrong_api_style',
      violationDescription: 'GraphQL (Apollo) instead of REST (Express)',
      secondaryViolation: 'missing_error_handling',
      primaryKeywords: ['graphql', 'apollo', 'not rest', 'wrong api'],
      secondaryKeywords: ['error handling', 'validation', 'input validation'],
      expectedFunctionalCorrectnessRange: { min: 0, max: 45 },
      expectedCodeQualityRange: { min: 40, max: 70 },
      expectedGrades: ['F', 'D'],
      description: 'Tests if AI detects GraphQL instead of REST API'
    },
    'pkg-02': {
      id: 'pkg-02',
      name: 'package-02',
      path: path.join(SemanticAuditTestRunner.PACKAGES_BASE_PATH, 'package-02'),
      violationKey: 'wrong_database',
      violationDescription: 'SQLite instead of PostgreSQL',
      secondaryViolation: 'missing_input_validation',
      primaryKeywords: ['sqlite', 'not postgresql', 'wrong database', 'sqlite instead'],
      secondaryKeywords: ['validation', 'input validation', 'sanitization'],
      expectedFunctionalCorrectnessRange: { min: 25, max: 55 },
      expectedCodeQualityRange: { min: 50, max: 75 },
      expectedGrades: ['D', 'C-'],
      description: 'Tests if AI detects SQLite instead of PostgreSQL'
    },
    'pkg-03': {
      id: 'pkg-03',
      name: 'package-03',
      path: path.join(SemanticAuditTestRunner.PACKAGES_BASE_PATH, 'package-03'),
      violationKey: 'missing_auth',
      violationDescription: 'No JWT authentication on protected endpoints',
      secondaryViolation: 'unused_jwt_imports',
      primaryKeywords: ['no auth', 'not authenticated', 'unprotected', 'missing jwt', 'no jwt'],
      secondaryKeywords: ['jwt', 'imported but', 'middleware', 'unused', 'not applied'],
      expectedFunctionalCorrectnessRange: { min: 15, max: 45 },
      expectedCodeQualityRange: { min: 50, max: 75 },
      expectedGrades: ['F', 'D'],
      description: 'Tests if AI detects missing JWT auth (HARDEST - unused imports)'
    },
    'pkg-04': {
      id: 'pkg-04',
      name: 'package-04',
      path: path.join(SemanticAuditTestRunner.PACKAGES_BASE_PATH, 'package-04'),
      violationKey: 'missing_tests',
      violationDescription: 'No unit test files',
      secondaryViolation: 'test_config_no_tests',
      primaryKeywords: ['no test', 'no tests', 'missing test', 'test coverage', '0% coverage'],
      secondaryKeywords: ['test script', 'jest', 'test configured', 'but no tests'],
      expectedFunctionalCorrectnessRange: { min: 55, max: 90 },
      expectedCodeQualityRange: { min: 75, max: 90 },
      expectedGrades: ['C', 'C+'],
      description: 'Tests if AI detects missing test files'
    },
    'pkg-05': {
      id: 'pkg-05',
      name: 'package-05',
      path: path.join(SemanticAuditTestRunner.PACKAGES_BASE_PATH, 'package-05'),
      violationKey: 'missing_health_endpoint',
      violationDescription: 'GET /health endpoint missing',
      secondaryViolation: 'wrong_endpoint_names',
      primaryKeywords: ['/health', 'health endpoint', 'missing /health', 'not found'],
      secondaryKeywords: ['/status', 'wrong name', 'endpoint name', 'not /health'],
      expectedFunctionalCorrectnessRange: { min: 45, max: 80 },
      expectedCodeQualityRange: { min: 75, max: 90 },
      expectedGrades: ['C', 'C-'],
      description: 'Tests if AI detects missing /health endpoint'
    },
    'pkg-06': {
      id: 'pkg-06',
      name: 'package-06-good',
      path: path.join(SemanticAuditTestRunner.PACKAGES_BASE_PATH, 'package-06-good'),
      violationKey: 'none',
      violationDescription: 'Good solution - all requirements met',
      primaryKeywords: ['express', 'postgresql', 'jwt', 'health', 'test'],
      expectedFunctionalCorrectnessRange: { min: 75, max: 100 },
      expectedCodeQualityRange: { min: 80, max: 100 },
      expectedGrades: ['A', 'A-', 'B+', 'B'],
      description: 'Validates good solution receives high marks'
    }
  };

  /**
   * Run all semantic audit tests
   */
  static async runAllTests(): Promise<TestRunSummary> {
    console.log('\n🚀 Starting Semantic Audit Test Run\n');
    console.log(`📍 Working directory: ${process.cwd()}`);
    console.log(`📦 Packages path: ${SemanticAuditTestRunner.PACKAGES_BASE_PATH}\n`);

    const startTime = Date.now();
    const results: TestRunResult[] = [];

    // Run tests in order: easy first, hardest last
    const testOrder = ['pkg-01', 'pkg-04', 'pkg-05', 'pkg-02', 'pkg-03', 'pkg-06'];

    for (const packageId of testOrder) {
      const config = SemanticAuditTestRunner.TEST_CONFIGS[packageId];
      console.log(`\n${'='.repeat(80)}`);
      console.log(`📋 Testing: ${config.name} (${config.violationKey})`);
      console.log(`${'='.repeat(80)}`);

      const result = await this.testPackage(config);
      results.push(result);

      // Print inline result
      console.log(`\n✓ Result: ${result.testResult.strength.toUpperCase()} (${result.testResult.score}/100)\n`);
    }

    const summary = this.compileSummary(results);
    const totalTime = Date.now() - startTime;

    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ Test Run Complete (${(totalTime / 1000).toFixed(2)}s)`);
    console.log(`${'='.repeat(80)}\n`);

    return summary;
  }

  /**
   * Test a single package
   */
  private static async testPackage(config: PackageTestConfig): Promise<TestRunResult> {
    const result: TestRunResult = {
      packageId: config.id,
      packageName: config.name,
      timestamp: new Date().toISOString(),
      execution: {
        success: false,
        zipProcessingTime: 0,
        analysisTime: 0,
        aiAnalysisTime: 0,
        totalTime: 0
      },
      rawData: {
        fileCount: 0,
        totalLines: 0,
        detectedLanguages: [],
        detectedFrameworks: []
      },
      detectionAnalysis: {
        primary: { passed: false, message: '' },
        secondary: { passed: false, message: '' },
        scoring: { passed: false, message: '' },
        overall: { passed: false, strength: 'fail', score: 0 }
      },
      testResult: {
        passed: false,
        strength: 'fail',
        score: 0,
        notes: ''
      }
    };

    try {
      console.log(`[START] ${config.name} - ${config.description}`);
      const totalStartTime = Date.now();

      // Step 1: Process ZIP file
      console.log(`  → Processing ZIP file...`);
      const zipStartTime = Date.now();
      const zipPath = path.join(config.path, `${config.name}.zip`);
      const zipScanResult = await ZipProcessor.scanZip(zipPath);
      result.execution.zipProcessingTime = Date.now() - zipStartTime;

      if (!zipScanResult.isValid) {
        throw new Error(`Invalid ZIP: ${zipScanResult.errors.join(', ')}`);
      }

      result.rawData.fileCount = zipScanResult.sourceFiles.length;
      result.rawData.totalLines = zipScanResult.sourceFiles.reduce((sum, f) => sum + (f.lines || 0), 0);
      console.log(`  ✓ ZIP processed: ${result.rawData.fileCount} files, ${result.rawData.totalLines} lines`);

      // Step 2: Analyze assignment
      console.log(`  → Analyzing assignment...`);
      const analysisStartTime = Date.now();
      const pdfPath = path.join(config.path, 'assignment.pdf');
      const pdfBuffer = fs.readFileSync(pdfPath);

      const assignmentAnalysis = await AssignmentAnalysisService.analyzeAssignment({
        zipScanResult,
        pdfBuffer
      });
      result.execution.analysisTime = Date.now() - analysisStartTime;

      if (!assignmentAnalysis.success) {
        throw new Error(`Analysis failed: ${assignmentAnalysis.errors.join(', ')}`);
      }

      result.rawData.detectedLanguages = assignmentAnalysis.metadata.detectedLanguage ? [assignmentAnalysis.metadata.detectedLanguage] : [];
      result.rawData.detectedFrameworks = assignmentAnalysis.metadata.detectedFrameworks || [];
      console.log(`  ✓ Assignment analyzed: ${result.rawData.detectedLanguages.join(', ')}`);

      // Step 3: AI Analysis
      console.log(`  → Running AI semantic audit...`);
      const aiStartTime = Date.now();
      const aiAnalysis = await AIAnalysisService.generateAIFeedback(assignmentAnalysis);
      result.execution.aiAnalysisTime = Date.now() - aiStartTime;

      if (!aiAnalysis.success) {
        throw new Error(`AI analysis failed: ${aiAnalysis.errors.join(', ')}`);
      }

      result.aiFeedback = aiAnalysis.feedback;
      console.log(`  ✓ AI feedback generated`);

      result.execution.success = true;
      result.execution.totalTime = Date.now() - totalStartTime;

      // Step 4: Run assertions
      console.log(`  → Running assertions...`);
      const feedbackText = `${result.aiFeedback?.overall.summary || ''} ${(result.aiFeedback?.codeQuality.weaknesses || []).join(' ')}`;
      const improvements = result.aiFeedback?.codeQuality.weaknesses || [];

      // Primary violation detection
      const primaryAssertion = SemanticAuditAssertions.assertViolationDetected(
        config.id,
        feedbackText,
        config.primaryKeywords,
        config.violationDescription
      );

      // Secondary violation detection
      const secondaryAssertion = config.secondaryKeywords
        ? SemanticAuditAssertions.assertSecondaryViolationDetected(
          config.id,
          feedbackText,
          config.secondaryKeywords,
          config.secondaryViolation || 'N/A'
        )
        : { passed: false, message: 'No secondary keywords defined' };

      // Scoring validation
      const scoringAssertion = SemanticAuditAssertions.assertFunctionalCorrectnessScore(
        config.id,
        result.aiFeedback?.functionalCorrectness.score || 0,
        config.expectedFunctionalCorrectnessRange.min,
        config.expectedFunctionalCorrectnessRange.max
      );

      // Grade validation
      const gradeAssertion = SemanticAuditAssertions.assertGradeMatchesViolation(
        config.id,
        result.aiFeedback?.overall.grade || 'N/A',
        config.expectedGrades
      );

      // Feedback quality
      const feedbackAssertion = SemanticAuditAssertions.assertActionableFeedback(
        config.id,
        improvements
      );

      // Calculate overall detection strength
      const detectionResult = SemanticAuditAssertions.calculateDetectionStrength(
        primaryAssertion.passed,
        ((primaryAssertion.passed ? 50 : 0) + (scoringAssertion.passed ? 50 : 0)) / 2,
        secondaryAssertion.passed,
        gradeAssertion.passed,
        feedbackAssertion.passed
      );

      result.detectionAnalysis = detectionResult;
      result.testResult = {
        passed: detectionResult.overall.passed,
        strength: detectionResult.overall.strength,
        score: detectionResult.overall.score,
        notes: `${primaryAssertion.message} | ${scoringAssertion.message}`
      };

      console.log(`  ✓ Assertions completed: ${detectionResult.overall.strength.toUpperCase()}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.execution.error = errorMessage;
      result.execution.totalTime = Date.now();
      result.testResult.notes = `ERROR: ${errorMessage}`;

      console.log(`  ✗ ERROR: ${errorMessage}`);
      appLogger.error(`Test failed for ${config.name}`, { error: errorMessage });
    }

    return result;
  }

  /**
   * Compile overall test summary
   */
  private static compileSummary(results: TestRunResult[]): TestRunSummary {
    const passed = results.filter(r => r.testResult.passed).length;
    const failed = results.length - passed;

    const strengths: string[] = [];
    const weaknesses: string[] = [];

    // Analyze results to find patterns
    const excellentCount = results.filter(r => r.testResult.strength === 'excellent').length;
    const goodCount = results.filter(r => r.testResult.strength === 'good').length;
    const failCount = results.filter(r => r.testResult.strength === 'fail').length;

    if (excellentCount >= 3) strengths.push('Catches compound violations (primary + secondary)');
    if (goodCount >= 4) strengths.push('Consistent detection across multiple violation types');
    if (results.find(r => r.packageId === 'pkg-03' && r.testResult.strength === 'good')) {
      strengths.push('Detects subtle issues (unused JWT middleware)');
    }

    if (failCount >= 2) weaknesses.push('Misses critical violations');
    if (results.find(r => r.packageId === 'pkg-03' && r.testResult.strength !== 'good')) {
      weaknesses.push('Struggles with subtle/unused code detection');
    }
    if (results.find(r => r.testResult.score < 50)) {
      weaknesses.push('Some scoring misalignments with violation severity');
    }

    return {
      timestamp: new Date().toISOString(),
      totalPackages: results.length,
      results,
      summary: {
        totalPassed: passed,
        totalFailed: failed,
        detectionRate: (passed / results.length) * 100,
        secondaryDetectionRate: (results.filter(r => r.detectionAnalysis.secondary.passed).length / results.length) * 100,
        averageScore: results.reduce((sum, r) => sum + r.testResult.score, 0) / results.length,
        strengths,
        weaknesses
      }
    };
  }

  /**
   * Export results to JSON file
   */
  static exportResultsToJSON(summary: TestRunSummary, outputPath?: string): string {
    const dir = outputPath || path.join(process.cwd(), 'backend/src/features/assignment/tests/results');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filename = `semantic-audit-${new Date().toISOString().split('T')[0]}-${Date.now()}.json`;
    const filepath = path.join(dir, filename);

    fs.writeFileSync(filepath, JSON.stringify(summary, null, 2));
    console.log(`\n📁 Results exported to: ${filepath}`);

    return filepath;
  }
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  SemanticAuditTestRunner.runAllTests()
    .then(summary => {
      SemanticAuditTestRunner.exportResultsToJSON(summary);
      process.exit(summary.summary.totalFailed === 0 ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export default SemanticAuditTestRunner;
