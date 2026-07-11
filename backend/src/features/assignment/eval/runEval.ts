/**
 * Assignment AI evaluation harness — measures violation detection,
 * score calibration, noise reduction, and pkg-06 specificity.
 *
 * Run: `npm run eval:assignment` (requires GEMINI_API_KEY).
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ZipProcessor, type ZipScanResult } from '../../../common/utils/zipProcessor.js';
import { AssignmentAnalysisService } from '../services/assignmentAnalysisService.js';
import { AIAnalysisService, type AIAnalysisResult } from '../services/aiAnalysisService.js';

import {
  PACKAGE_FIXTURES,
  zipPathFor,
  assignmentPdfPathFor,
  type PackageFixture,
} from './fixtures.js';
import { checkNoiseReduction, type NoiseReductionResult } from './noiseReduction.js';
import { detectViolations, type ViolationDetectionResult } from './violationDetection.js';
import { checkScoreCalibration, type ScoreCalibrationResult } from './scoreCalibration.js';

// ── Tunables ────────────────────────────────────────────────────────

const PACKAGE_COOLDOWN_MS = Number(process.env.SEMANTIC_AUDIT_PACKAGE_COOLDOWN_MS || '12000');
const FINAL_PACKAGE_COOLDOWN_MS = Number(process.env.SEMANTIC_AUDIT_FINAL_PACKAGE_COOLDOWN_MS || '45000');

// Easy → hard, good package last (calmer rate-limit window for the final score).
const RUN_ORDER = ['pkg-01', 'pkg-04', 'pkg-05', 'pkg-02', 'pkg-03', 'pkg-06'];

// Optional subset filter, e.g. EVAL_ONLY=pkg-03,pkg-06 runs just those two packages.
// Useful for re-checking specific packages without spending quota on the whole suite.
const ONLY_PACKAGES = (process.env.EVAL_ONLY || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// ── Pretty printing ─────────────────────────────────────────────────

function header(text: string) {
  const line = '='.repeat(82);
  console.log(`\n${line}\n  ${text}\n${line}`);
}

function section(text: string) {
  console.log(`\n${'─'.repeat(82)}\n  ${text}\n${'─'.repeat(82)}`);
}

function pad(value: string | number, width: number, align: 'left' | 'right' = 'left'): string {
  const s = String(value);
  if (s.length >= width) return s.slice(0, width);
  return align === 'left' ? s.padEnd(width) : s.padStart(width);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Per-package eval ────────────────────────────────────────────────

interface PackageEvalRow {
  fixture: PackageFixture;
  scan: ZipScanResult;
  noise: NoiseReductionResult;
  feedback?: AIAnalysisResult['feedback'];
  detection?: ViolationDetectionResult;
  calibration?: ScoreCalibrationResult;
  error?: string;
  elapsedMs: number;
}

async function evalPackage(fixture: PackageFixture): Promise<PackageEvalRow> {
  const t0 = Date.now();
  console.log(`\n[${fixture.id}] ${fixture.description}`);

  const zipPath = zipPathFor(fixture);
  const pdfPath = assignmentPdfPathFor(fixture);

  const zipBuffer = fs.readFileSync(zipPath);
  const scan = await ZipProcessor.scanZipFile(zipBuffer);

  if (!scan.isValid) {
    return {
      fixture,
      scan,
      noise: checkNoiseReduction(fixture.id, scan),
      error: `ZIP scan failed: ${scan.errors.join('; ')}`,
      elapsedMs: Date.now() - t0,
    };
  }

  const noise = checkNoiseReduction(fixture.id, scan);
  console.log(
    `  zip: ${scan.sourceFiles.length} source / ${noise.noiseCount} noise / ${noise.nonSourceCount} non-source` +
      ` (${(noise.noiseReductionRate * 100).toFixed(1)}% filtered)`
  );

  const pdfBuffer = fs.readFileSync(pdfPath);
  const analysis = await AssignmentAnalysisService.analyzeAssignment({
    zipScanResult: scan,
    pdfBuffer,
  });

  if (!analysis.success) {
    return {
      fixture,
      scan,
      noise,
      error: `Assignment analysis failed: ${analysis.errors.join('; ')}`,
      elapsedMs: Date.now() - t0,
    };
  }

  const sourceCodeContent = scan.sourceFiles.reduce((acc, file) => {
    acc[file.path] = file.content;
    return acc;
  }, {} as Record<string, string>);

  const totalLines = scan.sourceFiles.reduce(
    (sum, file) => sum + file.content.split(/\r?\n/).length,
    0
  );

  const solutionFileKey = `${fixture.zipBaseName}.zip`;

  console.log(`  calling Gemini...`);
  const aiResult = await AIAnalysisService.analyzeFromMetadata({
    metadata: {
      ...analysis.metadata,
      solutionFileKey,
      totalFiles: scan.totalFiles,
      totalLines,
      detectedLanguage: analysis.metadata.detectedLanguage || scan.detectedLanguage || undefined,
      detectedFrameworks: analysis.metadata.detectedFrameworks?.length
        ? analysis.metadata.detectedFrameworks
        : scan.metadata.frameworks,
      requirements: analysis.metadata.extractedRequirements || '',
      sourceCodeContent,
      sourceCodeSummary: analysis.sourceCodeSummary,
    },
    requirementsFileKey: `${fixture.folderName}-assignment.pdf`,
    solutionFileKey,
  });

  if (!aiResult.success || !aiResult.feedback) {
    return {
      fixture,
      scan,
      noise,
      feedback: aiResult.feedback,
      error: aiResult.error || 'AI analysis returned no feedback',
      elapsedMs: Date.now() - t0,
    };
  }

  const detection = detectViolations(fixture, aiResult.feedback);
  const calibration = checkScoreCalibration(fixture, aiResult.feedback);

  const elapsedMs = Date.now() - t0;
  console.log(
    `  → primary: ${detection.primaryDetected ? 'YES' : 'NO '} | ` +
      `score ${calibration.functionalActual}% (expect ${calibration.functionalExpected.min}-${calibration.functionalExpected.max}) | ` +
      `grade ${calibration.gradeActual}` +
      ` | ${elapsedMs}ms`
  );

  return {
    fixture,
    scan,
    noise,
    feedback: aiResult.feedback,
    detection,
    calibration,
    elapsedMs,
  };
}

// ── Reporting ───────────────────────────────────────────────────────

function printDetectionTable(rows: PackageEvalRow[]) {
  section('CRITICAL VIOLATION DETECTION  (primary keyword + score window + grade)');
  console.log(
    `  ${pad('Pkg', 8)} ${pad('Violation', 32)} ${pad('Primary', 8, 'right')} ` +
      `${pad('Score', 8, 'right')} ${pad('Range', 11, 'right')} ${pad('Grade', 8, 'right')}`
  );
  console.log(`  ${'-'.repeat(80)}`);

  for (const r of rows) {
    if (r.error || !r.detection || !r.calibration) {
      console.log(
        `  ${pad(r.fixture.id, 8)} ${pad(r.fixture.violationDescription, 32)} ${pad('ERROR', 8, 'right')} ` +
          `${pad('—', 8, 'right')} ${pad('—', 11, 'right')} ${pad('—', 8, 'right')}`
      );
      continue;
    }
    const primary = r.detection.primaryDetected ? '✓' : '✗';
    const scoreOk = r.calibration.functionalInRange ? '' : '!';
    const gradeOk = r.calibration.gradeMatches ? '' : '!';
    const range = `[${r.calibration.functionalExpected.min}-${r.calibration.functionalExpected.max}]`;

    console.log(
      `  ${pad(r.fixture.id, 8)} ${pad(r.fixture.violationDescription, 32)} ${pad(primary, 8, 'right')} ` +
        `${pad(`${r.calibration.functionalActual}%${scoreOk}`, 8, 'right')} ${pad(range, 11, 'right')} ` +
        `${pad(`${r.calibration.gradeActual}${gradeOk}`, 8, 'right')}`
    );
  }
}

function printNoiseTable(rows: PackageEvalRow[]) {
  section('NOISE REDUCTION  (ZipProcessor filtering)');
  console.log(
    `  ${pad('Pkg', 8)} ${pad('Source', 8, 'right')} ${pad('Noise', 8, 'right')} ` +
      `${pad('NonSrc', 8, 'right')} ${pad('Leaked', 8, 'right')} ${pad('Filtered', 10, 'right')}`
  );
  console.log(`  ${'-'.repeat(60)}`);

  let totalNoise = 0;
  let totalNonSource = 0;
  let totalLeaked = 0;
  for (const r of rows) {
    totalNoise += r.noise.noiseCount;
    totalNonSource += r.noise.nonSourceCount;
    totalLeaked += r.noise.leakedPaths.length;
    console.log(
      `  ${pad(r.fixture.id, 8)} ${pad(r.noise.sourceCount, 8, 'right')} ` +
        `${pad(r.noise.noiseCount, 8, 'right')} ${pad(r.noise.nonSourceCount, 8, 'right')} ` +
        `${pad(r.noise.leakedPaths.length, 8, 'right')} ${pad((r.noise.noiseReductionRate * 100).toFixed(1) + '%', 10, 'right')}`
    );
  }
  console.log(`  ${'-'.repeat(60)}`);
  const totalToFilter = totalNoise + totalNonSource;
  const overallRate = totalToFilter === 0 ? 1 : (totalToFilter - totalLeaked) / totalToFilter;
  console.log(
    `  ${pad('TOTAL', 8)} ${pad('—', 8, 'right')} ${pad(totalNoise, 8, 'right')} ` +
      `${pad(totalNonSource, 8, 'right')} ${pad(totalLeaked, 8, 'right')} ${pad((overallRate * 100).toFixed(1) + '%', 10, 'right')}`
  );

  for (const r of rows) {
    if (r.noise.leakedPaths.length > 0) {
      console.log(`\n  ! ${r.fixture.id} leaked paths (filtered list overlapped sourceFiles):`);
      for (const p of r.noise.leakedPaths) console.log(`      - ${p}`);
    }
  }
}

function printSpecificityRow(rows: PackageEvalRow[]) {
  section('SPECIFICITY  (no false positives on the good package)');
  const good = rows.find((r) => r.fixture.isGood);
  if (!good) {
    console.log('  No good-package fixture in this run.');
    return;
  }
  if (good.error || !good.calibration) {
    console.log(`  pkg-06 ERROR: ${good.error}`);
    return;
  }
  const scoreOk = good.calibration.functionalInRange;
  const gradeOk = good.calibration.gradeMatches;
  const passed = scoreOk && gradeOk;
  console.log(
    `  ${good.fixture.id}  functional: ${good.calibration.functionalActual}%` +
      ` (need ≥${good.calibration.functionalExpected.min})` +
      `   grade: ${good.calibration.gradeActual}` +
      ` (expect ${good.calibration.gradeExpected.join('/')})` +
      `   ${passed ? '✓ no false positives' : '✗ falsely flagged'}`
  );
}

// ── JSON dump + main ────────────────────────────────────────────────

interface FullEvalReport {
  generatedAt: string;
  rows: Array<{
    packageId: string;
    violationKey: string;
    violationDescription: string;
    elapsedMs: number;
    error?: string;
    noise: NoiseReductionResult;
    detection?: ViolationDetectionResult;
    calibration?: ScoreCalibrationResult;
    feedback?: AIAnalysisResult['feedback'];
  }>;
  summary: {
    faultyPackages: number;
    primaryDetections: number;
    detectionRate: number;
    secondaryDetections: number;
    calibrationPasses: number;
    overallNoiseReductionRate: number;
    totalNoiseFiles: number;
    totalNonSourceFiles: number;
    totalLeaked: number;
    goodPackageFalsePositive: boolean;
    goodPackageError: boolean;
  };
}

function writeJsonReport(report: FullEvalReport): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const outDir = path.join(__dirname, 'eval-reports');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(outDir, `assignment-eval-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2), 'utf-8');
  return file;
}

async function main() {
  header('Assignment AI Evaluation Harness');

  const useMock = process.env.SEMANTIC_AUDIT_USE_MOCK_AI === 'true';
  if (!useMock && !process.env.GEMINI_API_KEY) {
    console.error('\n  ERROR: GEMINI_API_KEY is not set in .env (and SEMANTIC_AUDIT_USE_MOCK_AI is not true).\n');
    process.exit(1);
  }

  console.log(`  Packages          : ${PACKAGE_FIXTURES.length}`);
  console.log(`  Mode              : ${useMock ? 'mock AI' : 'real Gemini'}`);
  console.log(`  Cooldown / package: ${PACKAGE_COOLDOWN_MS}ms (final: ${FINAL_PACKAGE_COOLDOWN_MS}ms)`);

  const orderedFixtures = RUN_ORDER
    .filter((id) => ONLY_PACKAGES.length === 0 || ONLY_PACKAGES.includes(id))
    .map((id) => PACKAGE_FIXTURES.find((f) => f.id === id))
    .filter((f): f is PackageFixture => Boolean(f));

  if (ONLY_PACKAGES.length > 0) {
    console.log(`  Filter (EVAL_ONLY) : ${orderedFixtures.map((f) => f.id).join(', ') || '(none matched)'}`);
  }

  const rows: PackageEvalRow[] = [];
  for (let i = 0; i < orderedFixtures.length; i++) {
    const fixture = orderedFixtures[i];
    try {
      const row = await evalPackage(fixture);
      rows.push(row);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`  FATAL [${fixture.id}]: ${message}`);
      rows.push({
        fixture,
        scan: {
          isValid: false,
          totalFiles: 0,
          sourceFiles: [],
          detectedLanguage: null,
          projectScope: 'small',
          totalSourceSize: 0,
          errors: [message],
          noiseFilesIgnored: [],
          nonSourceFilesIgnored: [],
          metadata: {
            hasPackageJson: false,
            hasReadme: false,
            hasGitRepo: false,
            mainLanguageConfidence: 0,
            frameworks: [],
          },
        },
        noise: {
          packageId: fixture.id,
          totalEntries: 0,
          sourceCount: 0,
          noiseCount: 0,
          nonSourceCount: 0,
          filteredCorrectly: 0,
          leakedPaths: [],
          noiseReductionRate: 1,
        },
        error: message,
        elapsedMs: 0,
      });
    }

    const isLast = i === orderedFixtures.length - 1;
    if (!isLast && !useMock) {
      const nextIsGood = orderedFixtures[i + 1]?.isGood;
      const cooldown = nextIsGood ? FINAL_PACKAGE_COOLDOWN_MS : PACKAGE_COOLDOWN_MS;
      if (cooldown > 0) {
        console.log(`  ⏳ cooldown ${cooldown / 1000}s before next package...`);
        await sleep(cooldown);
      }
    }
  }

  const faulty = rows.filter((r) => !r.fixture.isGood);
  const good = rows.find((r) => r.fixture.isGood);

  const primaryDetections = faulty.filter((r) => r.detection?.primaryDetected).length;
  const secondaryDetections = faulty.filter((r) => r.detection?.secondaryDetected).length;
  const calibrationPasses = faulty.filter((r) => r.calibration?.allInRange).length;

  const totalNoiseFiles = rows.reduce((acc, r) => acc + r.noise.noiseCount, 0);
  const totalNonSourceFiles = rows.reduce((acc, r) => acc + r.noise.nonSourceCount, 0);
  const totalLeaked = rows.reduce((acc, r) => acc + r.noise.leakedPaths.length, 0);
  const totalToFilter = totalNoiseFiles + totalNonSourceFiles;
  const overallNoiseReductionRate =
    totalToFilter === 0 ? 1 : (totalToFilter - totalLeaked) / totalToFilter;

  // An infra/parse error on the good package is NOT a grading false positive —
  // track it separately so a malformed response doesn't masquerade as a specificity miss.
  const goodPackageError = good ? Boolean(good.error || !good.calibration) : false;
  const goodFalsePositive = good && !goodPackageError
    ? !(good.calibration?.functionalInRange && good.calibration?.gradeMatches)
    : false;

  printDetectionTable(rows);
  printNoiseTable(rows);
  printSpecificityRow(rows);

  header('EVALUATION COMPLETE');
  const detectionRate = faulty.length === 0 ? 1 : primaryDetections / faulty.length;

  console.log(`  Critical violation detection : ${primaryDetections} / ${faulty.length}  (${(detectionRate * 100).toFixed(1)}%)`);
  console.log(`  Score-window calibration     : ${calibrationPasses} / ${faulty.length}`);
  console.log(`  Secondary detections (bonus) : ${secondaryDetections} / ${faulty.length}`);
  console.log(`  Noise reduction (overall)    : ${(overallNoiseReductionRate * 100).toFixed(1)}%  (${totalToFilter - totalLeaked}/${totalToFilter} non-source files filtered)`);
  console.log(`  False positive on pkg-06     : ${goodFalsePositive ? 'YES' : 'no'}`);
  if (goodPackageError) {
    console.log(`  pkg-06 status                : ERROR (not graded) — ${good?.error}`);
  }

  if (detectionRate >= 1 && overallNoiseReductionRate >= 1 && !goodFalsePositive && !goodPackageError) {
    console.log(`\n  REQUIREMENT MET: 100% violation detection, 100% noise reduction, no false positives.`);
  } else {
    const missed = faulty.filter((r) => !r.detection?.primaryDetected).map((r) => r.fixture.id);
    if (missed.length > 0) console.log(`\n  REQUIREMENT NOT MET — missed violations on: ${missed.join(', ')}`);
    if (overallNoiseReductionRate < 1) console.log(`  REQUIREMENT NOT MET — ${totalLeaked} non-source files leaked through ZipProcessor.`);
    if (goodFalsePositive) console.log(`  REQUIREMENT NOT MET — pkg-06 was incorrectly flagged.`);
    if (goodPackageError) console.log(`  INCONCLUSIVE — pkg-06 errored before grading (not a false positive); see error above.`);
  }

  const report: FullEvalReport = {
    generatedAt: new Date().toISOString(),
    rows: rows.map((r) => ({
      packageId: r.fixture.id,
      violationKey: r.fixture.violationKey,
      violationDescription: r.fixture.violationDescription,
      elapsedMs: r.elapsedMs,
      error: r.error,
      noise: r.noise,
      detection: r.detection,
      calibration: r.calibration,
      feedback: r.feedback,
    })),
    summary: {
      faultyPackages: faulty.length,
      primaryDetections,
      detectionRate,
      secondaryDetections,
      calibrationPasses,
      overallNoiseReductionRate,
      totalNoiseFiles,
      totalNonSourceFiles,
      totalLeaked,
      goodPackageFalsePositive: goodFalsePositive,
      goodPackageError,
    },
  };

  const reportPath = writeJsonReport(report);
  console.log(`\n  Report saved to: ${reportPath}`);
}

main().catch((err) => {
  console.error(`\n  EVAL FAILED: ${err instanceof Error ? err.message : err}\n`);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
