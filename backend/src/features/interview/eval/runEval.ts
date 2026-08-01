/**
 * Interview STAR evaluation harness — runs all benchmark checks
 * against ground-truth fixtures and produces a structured report.
 *
 * In "mock" mode (default), it uses the fixtures themselves as both
 * ground truth and predictions (with optional perturbations) to verify
 * the evaluation framework works end-to-end.
 *
 * In "live" mode (future), it would call the actual transcription and
 * analysis pipeline.
 *
 * Run: `npm run eval:interview`
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { INTERVIEW_FIXTURES, type InterviewFixture, type StarSegment, type FillerWordsSummary } from './fixtures.js';
import { calculateWer, type WerDetail } from './werCalculator.js';
import { evaluateStarAccuracy, type StarAccuracyResult } from './starAccuracy.js';
import { evaluateFillerAccuracy, type FillerAccuracyResult } from './fillerAccuracy.js';
import { checkCalibration, type CalibrationResult } from './calibrationCheck.js';
import { determinePassFail, type EvalPassFail, type FixtureResult } from './scoreCalibration.js';

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

// ── Mock prediction generator ──────────────────────────────────────

/**
 * Generate a "predicted" transcript from the ground truth by
 * introducing small perturbations (simulating real STT errors).
 */
function perturbTranscript(reference: string, errorRate: number = 0.05): string {
  const words = reference.split(/\s+/);
  const substitutions = ['uh', 'the', 'a', 'that', 'this'];

  return words
    .map((word) => {
      if (Math.random() < errorRate) {
        const r = Math.random();
        if (r < 0.5) {
          // substitution
          return substitutions[Math.floor(Math.random() * substitutions.length)];
        } else if (r < 0.75) {
          // deletion
          return '';
        } else {
          // insertion
          return `${word} ${substitutions[Math.floor(Math.random() * substitutions.length)]}`;
        }
      }
      return word;
    })
    .filter((w) => w.length > 0)
    .join(' ');
}

/**
 * Generate mock predicted STAR segments by slightly shifting boundaries.
 */
function perturbStarMap(truthMap: StarSegment[], jitter: number = 2): StarSegment[] {
  return truthMap.map((seg) => ({
    ...seg,
    startWord: Math.max(0, seg.startWord + Math.floor(Math.random() * jitter * 2) - jitter),
    endWord: seg.endWord + Math.floor(Math.random() * jitter * 2) - jitter,
  }));
}

/**
 * Generate mock predicted filler counts by adding small noise.
 */
function perturbFillers(truth: FillerWordsSummary, maxDelta: number = 2): FillerWordsSummary {
  const noisedExamples = truth.examples.map((ex) => ({
    ...ex,
    count: Math.max(0, ex.count + Math.floor(Math.random() * maxDelta * 2) - maxDelta),
  }));
  const totalCount = noisedExamples.reduce((sum, e) => sum + e.count, 0);
  return {
    totalCount,
    ratePerMinute: truth.ratePerMinute, // keep rate unchanged for mock
    examples: noisedExamples,
  };
}

// ── Per-fixture eval ───────────────────────────────────────────────

interface FixtureEvalRow {
  fixture: InterviewFixture;
  wer: WerDetail;
  star: StarAccuracyResult;
  filler: FillerAccuracyResult;
  calibration: CalibrationResult;
  /** The predicted overall score used in calibration (mock: use middle of expected range). */
  predictedScore: number;
}

function evalFixture(fixture: InterviewFixture): FixtureEvalRow {
  // Generate mock predictions
  const predictedTranscript = perturbTranscript(fixture.referenceTranscript, 0.05);
  const predictedStarMap = perturbStarMap(fixture.starMap, 2);
  const predictedFillers = perturbFillers(fixture.fillerWords, 2);

  // Mock overall score: midpoint of expected range
  const predictedScore = Math.round(
    (fixture.expectedScoreRange.min + fixture.expectedScoreRange.max) / 2
  );

  // Run evaluations
  const wer = calculateWer(fixture.referenceTranscript, predictedTranscript);
  const star = evaluateStarAccuracy(fixture.starMap, predictedStarMap);
  const filler = evaluateFillerAccuracy(fixture.fillerWords, predictedFillers);
  const calibration = checkCalibration({
    overallScore: predictedScore,
    fillerRatePerMinute: fixture.fillerWords.ratePerMinute,
    pacingWpm: fixture.pacingWpm,
    starComponentsDetected: star.detectedCount,
    starComponentsExpected: star.totalExpected,
  });

  return { fixture, wer, star, filler, calibration, predictedScore };
}

// ── Reporting ───────────────────────────────────────────────────────

function printWerTable(rows: FixtureEvalRow[]) {
  section('WORD ERROR RATE  (predicted vs reference transcript)');
  console.log(
    `  ${pad('ID', 8)} ${pad('WER', 8, 'right')} ${pad('Sub', 6, 'right')} ` +
      `${pad('Ins', 6, 'right')} ${pad('Del', 6, 'right')} ${pad('Ref', 6, 'right')} ` +
      `${pad('Hyp', 6, 'right')} ${pad('Pass', 6, 'right')}`
  );
  console.log(`  ${'-'.repeat(58)}`);

  for (const r of rows) {
    const pass = r.wer.wer < 0.15 ? 'Y' : 'N';
    console.log(
      `  ${pad(r.fixture.id, 8)} ${pad((r.wer.wer * 100).toFixed(1) + '%', 8, 'right')} ` +
        `${pad(r.wer.substitutions, 6, 'right')} ${pad(r.wer.insertions, 6, 'right')} ` +
        `${pad(r.wer.deletions, 6, 'right')} ${pad(r.wer.referenceLength, 6, 'right')} ` +
        `${pad(r.wer.hypothesisLength, 6, 'right')} ${pad(pass, 6, 'right')}`
    );
  }
}

function printStarTable(rows: FixtureEvalRow[]) {
  section('STAR LABEL ACCURACY  (per-component detection + IoU)');
  console.log(
    `  ${pad('ID', 8)} ${pad('S', 4)} ${pad('T', 4)} ${pad('A', 4)} ${pad('R', 4)} ` +
      `${pad('Acc', 8, 'right')} ${pad('Avg IoU', 10, 'right')} ${pad('Action', 8, 'right')}`
  );
  console.log(`  ${'-'.repeat(54)}`);

  for (const r of rows) {
    const flags = ['situation', 'task', 'action', 'result'].map((label) => {
      const comp = r.star.components.find((c) => c.label === label);
      return comp?.detected ? 'Y' : '-';
    });

    console.log(
      `  ${pad(r.fixture.id, 8)} ${flags.map((f) => pad(f, 4)).join('')} ` +
        `${pad((r.star.accuracy * 100).toFixed(0) + '%', 8, 'right')} ` +
        `${pad(r.star.averageIou.toFixed(2), 10, 'right')} ` +
        `${pad(r.star.actionDetected ? 'Y' : 'N', 8, 'right')}`
    );
  }
}

function printFillerTable(rows: FixtureEvalRow[]) {
  section('FILLER WORD ACCURACY  (predicted vs ground truth)');
  console.log(
    `  ${pad('ID', 8)} ${pad('Expected', 10, 'right')} ${pad('Actual', 10, 'right')} ` +
      `${pad('Delta', 8, 'right')} ${pad('Pass', 6, 'right')}`
  );
  console.log(`  ${'-'.repeat(46)}`);

  for (const r of rows) {
    console.log(
      `  ${pad(r.fixture.id, 8)} ${pad(r.filler.expectedCount, 10, 'right')} ` +
        `${pad(r.filler.actualCount, 10, 'right')} ${pad(r.filler.delta, 8, 'right')} ` +
        `${pad(r.filler.withinTolerance ? 'Y' : 'N', 6, 'right')}`
    );
  }
}

function printCalibrationTable(rows: FixtureEvalRow[]) {
  section('BEHAVIORAL CALIBRATION  (score vs metrics consistency)');
  console.log(
    `  ${pad('ID', 8)} ${pad('Score', 8, 'right')} ${pad('Filler', 8, 'right')} ` +
      `${pad('Pace', 8, 'right')} ${pad('STAR', 8, 'right')} ${pad('Aligned', 8, 'right')}`
  );
  console.log(`  ${'-'.repeat(52)}`);

  for (const r of rows) {
    console.log(
      `  ${pad(r.fixture.id, 8)} ${pad(r.predictedScore, 8, 'right')} ` +
        `${pad(r.calibration.checks.fillerRateAligned ? 'Y' : 'N', 8, 'right')} ` +
        `${pad(r.calibration.checks.pacingAligned ? 'Y' : 'N', 8, 'right')} ` +
        `${pad(r.calibration.checks.starCoverageAligned ? 'Y' : 'N', 8, 'right')} ` +
        `${pad(r.calibration.aligned ? 'Y' : 'N', 8, 'right')}`
    );
    for (const note of r.calibration.notes) {
      console.log(`           ${note}`);
    }
  }
}

// ── Structured report ──────────────────────────────────────────────

export interface InterviewEvalReport {
  generatedAt: string;
  passed: boolean;
  wer: number;
  starAccuracy: number;
  fillerAccuracy: {
    withinTolerance: boolean;
    delta: number;
  };
  calibration: {
    aligned: boolean;
  };
  details: EvalPassFail;
  perFixture: Array<{
    id: string;
    description: string;
    wer: WerDetail;
    star: StarAccuracyResult;
    filler: FillerAccuracyResult;
    calibration: CalibrationResult;
    predictedScore: number;
  }>;
}

function buildReport(rows: FixtureEvalRow[]): InterviewEvalReport {
  const fixtureResults: FixtureResult[] = rows.map((r) => ({
    wer: r.wer.wer,
    actionDetected: r.star.actionDetected,
    starAccuracy: r.star.accuracy,
    fillerWithinTolerance: r.filler.withinTolerance,
    fillerDelta: r.filler.delta,
    calibrationAligned: r.calibration.aligned,
  }));

  const passFail = determinePassFail(fixtureResults);

  const avgDelta =
    rows.reduce((sum, r) => sum + r.filler.delta, 0) / rows.length;

  return {
    generatedAt: new Date().toISOString(),
    passed: passFail.passed,
    wer: passFail.werAverage,
    starAccuracy: passFail.starAccuracy,
    fillerAccuracy: {
      withinTolerance: passFail.fillerPassed,
      delta: avgDelta,
    },
    calibration: {
      aligned: passFail.calibrationAligned,
    },
    details: passFail,
    perFixture: rows.map((r) => ({
      id: r.fixture.id,
      description: r.fixture.description,
      wer: r.wer,
      star: r.star,
      filler: r.filler,
      calibration: r.calibration,
      predictedScore: r.predictedScore,
    })),
  };
}

function writeJsonReport(report: InterviewEvalReport): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const outDir = path.join(__dirname, 'eval-reports');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(outDir, `interview-eval-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2), 'utf-8');
  return file;
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  header('Interview STAR Evaluation Harness');

  console.log(`  Fixtures: ${INTERVIEW_FIXTURES.length}`);
  console.log(`  Mode    : mock (perturbed ground truth)`);

  const rows: FixtureEvalRow[] = [];
  for (const fixture of INTERVIEW_FIXTURES) {
    console.log(`\n  [${fixture.id}] ${fixture.description}`);
    const row = evalFixture(fixture);
    rows.push(row);
  }

  printWerTable(rows);
  printStarTable(rows);
  printFillerTable(rows);
  printCalibrationTable(rows);

  const report = buildReport(rows);

  header('EVALUATION SUMMARY');
  console.log(`  Overall pass   : ${report.passed ? 'YES' : 'NO'}`);
  console.log(`  Avg WER        : ${(report.wer * 100).toFixed(1)}%  (threshold: <15%)`);
  console.log(`  STAR accuracy  : ${(report.starAccuracy * 100).toFixed(1)}%`);
  console.log(`  Action detected: ${report.details.starActionDetections}/${report.details.totalFixtures}  (need >= 4)`);
  console.log(`  Filler in tol. : ${report.details.fillerWithinTolerance}/${report.details.totalFixtures}`);
  console.log(`  Calibration    : ${report.calibration.aligned ? 'aligned' : 'MISALIGNED'}`);

  const reportPath = writeJsonReport(report);
  console.log(`\n  Report saved to: ${reportPath}`);
}

main().catch((err) => {
  console.error(`\n  EVAL FAILED: ${err instanceof Error ? err.message : err}\n`);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
