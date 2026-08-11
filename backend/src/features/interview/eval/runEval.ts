/**
 * Interview STAR evaluation harness — runs all benchmark checks
 * against ground-truth fixtures and produces a structured report.
 *
 * This is a HYBRID harness, not a fully mocked one:
 *   - Filler-word counts and words-per-minute are computed by the REAL
 *     FillerWordService / PacingService against each fixture's
 *     referenceTranscript — the same deterministic code the production
 *     pipeline runs. A regression in either service shows up here.
 *   - Word Error Rate is measured against a SYNTHETIC "prediction" (the
 *     reference transcript with small perturbations applied) and CANNOT be
 *     made real: WER needs an actual STT prediction, and these fixtures are
 *     hand-written text with no matching audio recording. Treat this number
 *     as a self-test of the WER calculator utility only, never as a
 *     transcription-quality measurement.
 *   - STAR analysis, the candidate-vs-team-language rule, and the overall
 *     confidence score DO run for real in live mode
 *     (`EVAL_LIVE=true npm run eval:interview`, requires VPN access to
 *     Colman) — see liveStarCheck.ts. Default mode still uses a synthetic
 *     STAR prediction (boundary jitter) so `npm run eval:interview` stays
 *     fast, free, and usable offline/in CI.
 *   - `EVAL_AUDIO=true` additionally runs real audio fixtures
 *     (audioFixtures.ts) through the REAL WhisperClient — genuine WER
 *     against a stored baseline transcript (see audioFixtures.ts for why
 *     it's a baseline/drift check, not absolute ground truth), plus real
 *     filler/pacing computed from the actual transcription. Combine with
 *     EVAL_LIVE to also run the real LLM on the real transcript+segments.
 *
 * Run: `npm run eval:interview`
 * Run live (calls the real LLM, has a cooldown between fixtures):
 *   `EVAL_LIVE=true npm run eval:interview`
 * Run against real audio fixtures too (requires OPENAI_API_KEY):
 *   `EVAL_AUDIO=true EVAL_LIVE=true npm run eval:interview`
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { INTERVIEW_FIXTURES, type InterviewFixture, type StarSegment } from './fixtures.js';
import { calculateWer, type WerDetail } from './werCalculator.js';
import { evaluateStarAccuracy, type StarAccuracyResult } from './starAccuracy.js';
import { evaluateFillerAccuracy, type FillerAccuracyResult } from './fillerAccuracy.js';
import { checkCalibration, type CalibrationResult } from './calibrationCheck.js';
import { determinePassFail, type EvalPassFail, type FixtureResult } from './scoreCalibration.js';
import { evaluateLiveStar, type LiveStarCheckResult } from './liveStarCheck.js';
import {
  AUDIO_FIXTURES,
  audioPathFor,
  loadBaseline,
  type AudioFixture,
} from './audioFixtures.js';
import { evaluateAudioLive, type AudioLiveCheckResult } from './audioLiveCheck.js';
import { FillerWordService } from '../services/fillerWordService.js';
import { PacingService } from '../services/pacingService.js';
import { LLMInsightsService } from '../services/llmInsightsService.js';
import { WhisperClient } from '../../../common/services/whisperClient.js';

// ── Live-mode tunables ────────────────────────────────────────────────

const LIVE_MODE = process.env.EVAL_LIVE === 'true';
const AUDIO_MODE = process.env.EVAL_AUDIO === 'true';
const FIXTURE_COOLDOWN_MS = Number(process.env.EVAL_INTERVIEW_COOLDOWN_MS || '3000');

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

// ── Per-fixture eval ───────────────────────────────────────────────

interface FixtureEvalRow {
  fixture: InterviewFixture;
  wer: WerDetail;
  star: StarAccuracyResult;
  filler: FillerAccuracyResult;
  /** Real PacingService.calculate(...).wordsPerMinute for this fixture. */
  realWpm: number;
  pacingDelta: number;
  pacingWithinTolerance: boolean;
  calibration: CalibrationResult;
  /** The predicted overall score used in calibration (mock: use middle of expected range). */
  predictedScore: number;
  /** Populated only when LIVE_MODE is on — a real LLMInsightsService.analyse() call. */
  liveStar?: LiveStarCheckResult;
}

const PACING_TOLERANCE_WPM = 5;

// Two runs against the SAME audio file can legitimately differ a little
// (Whisper isn't perfectly deterministic run-to-run), so this isn't 0 — but
// it should stay small. A real regression (wrong file, provider swap, a
// broken audio-extraction step) will blow well past this.
const WER_DRIFT_TOLERANCE = 0.10;

function evalFixture(fixture: InterviewFixture): FixtureEvalRow {
  // WER and STAR still run against a synthetic prediction — see the
  // top-of-file comment for why (needs a live Whisper + Colman call).
  const predictedTranscript = perturbTranscript(fixture.referenceTranscript, 0.05);
  const predictedStarMap = perturbStarMap(fixture.starMap, 2);

  // Filler words and pacing run through the REAL deterministic services —
  // no perturbation, this is exactly what production computes.
  const realFiller = FillerWordService.count(fixture.referenceTranscript);
  const realPacing = PacingService.calculate(fixture.referenceTranscript, [], fixture.durationSec);

  // Mock overall score: midpoint of expected range
  const predictedScore = Math.round(
    (fixture.expectedScoreRange.min + fixture.expectedScoreRange.max) / 2
  );

  // Run evaluations
  const wer = calculateWer(fixture.referenceTranscript, predictedTranscript);
  const star = evaluateStarAccuracy(fixture.starMap, predictedStarMap);

  const realFillerRate = (realFiller.totalCount / fixture.durationSec) * 60;
  const filler = evaluateFillerAccuracy(fixture.fillerWords, {
    totalCount: realFiller.totalCount,
    ratePerMinute: realFillerRate,
    examples: realFiller.breakdown,
  });

  const pacingDelta = Math.abs(realPacing.wordsPerMinute - fixture.pacingWpm);
  const pacingWithinTolerance = pacingDelta <= PACING_TOLERANCE_WPM;

  const calibration = checkCalibration({
    overallScore: predictedScore,
    // Real computed values, not fixture ground truth — this is what the
    // pipeline actually "observed" for this transcript.
    fillerRatePerMinute: realFillerRate,
    pacingWpm: realPacing.wordsPerMinute,
    starComponentsDetected: star.detectedCount,
    starComponentsExpected: star.totalExpected,
  });

  return {
    fixture, wer, star, filler,
    realWpm: realPacing.wordsPerMinute,
    pacingDelta, pacingWithinTolerance,
    calibration, predictedScore,
  };
}

// ── Real-audio fixture eval (EVAL_AUDIO=true) ───────────────────────

interface AudioFixtureRow {
  fixture: AudioFixture;
  wer: WerDetail;
  realFillerCount: number;
  realWpm: number;
  durationSeconds: number;
  liveResult?: AudioLiveCheckResult;
  /** Set only if transcription itself failed — the whole row is unusable. */
  error?: string;
  /** Set only if transcription succeeded but the live LLM call failed —
   *  the rest of the row (real WER/filler/pacing) is still valid. */
  liveError?: string;
}

async function evalAudioFixture(fixture: AudioFixture): Promise<AudioFixtureRow> {
  const baseline = loadBaseline(fixture);
  const audioPath = audioPathFor(fixture);

  const transcription = await WhisperClient.transcribe(audioPath);

  // WER against the stored baseline — see audioFixtures.ts for why this is
  // a drift check against a snapshot, not absolute ground truth.
  const wer = calculateWer(baseline.text, transcription.text);

  const realFiller = FillerWordService.count(transcription.text);
  const realPacing = PacingService.calculate(
    transcription.text,
    transcription.segments,
    transcription.durationSeconds
  );

  const row: AudioFixtureRow = {
    fixture,
    wer,
    realFillerCount: realFiller.totalCount,
    realWpm: realPacing.wordsPerMinute,
    durationSeconds: transcription.durationSeconds ?? baseline.durationSeconds,
  };

  if (LIVE_MODE) {
    try {
      const llmResult = await LLMInsightsService.analyse(
        transcription.text,
        transcription.segments,
        realFiller.totalCount,
        realPacing.wordsPerMinute
      );
      row.liveResult = evaluateAudioLive(fixture, llmResult);
    } catch (err) {
      // Transcription already succeeded — don't let a Colman-side failure
      // discard the real WER/filler/pacing results computed above.
      row.liveError = err instanceof Error ? err.message : String(err);
    }
  }

  return row;
}

function printAudioTable(rows: AudioFixtureRow[]) {
  section('REAL AUDIO FIXTURES  (real WhisperClient transcription)');
  for (const r of rows) {
    console.log(`\n  [${r.fixture.id}] ${r.fixture.description}`);
    if (r.error) {
      console.log(`    ERROR: ${r.error}`);
      continue;
    }
    const werPass = r.wer.wer < WER_DRIFT_TOLERANCE ? 'Y' : 'N';
    console.log(
      `    WER vs baseline : ${(r.wer.wer * 100).toFixed(1)}%  ` +
        `(sub ${r.wer.substitutions}, ins ${r.wer.insertions}, del ${r.wer.deletions})  ` +
        `drift-tolerance-pass: ${werPass}`
    );
    console.log(`    Duration        : ${r.durationSeconds.toFixed(1)}s`);
    console.log(`    Filler count    : ${r.realFillerCount}  (whole transcript — no speaker separation)`);
    console.log(`    Words/min       : ${r.realWpm}  (whole transcript — no speaker separation)`);
    if (r.liveResult) {
      const lr = r.liveResult;
      console.log(
        `    Live confidence : ${lr.confidenceScore}  (plausible: ${lr.scoreIsPlausible ? 'Y' : 'N'})`
      );
      console.log(
        `    Personal agency : expected ${lr.personalAgency.expected}, got ${lr.personalAgency.actual}` +
          ` (${lr.personalAgency.correct ? 'Y' : 'N'})`
      );
      console.log(`    Coaching content: ${lr.hasCoachingContent ? 'Y' : 'N'}`);
      console.log(`    STAR non-empty  : ${lr.starSectionsNonEmpty ? 'Y' : 'N'}`);
      console.log(`    Live check pass : ${lr.passed ? 'Y' : 'N'}`);
    } else if (r.liveError) {
      console.log(`    Live check      : FAILED (transcription was fine) — ${r.liveError}`);
    } else if (LIVE_MODE) {
      console.log(`    Live check      : call failed, see error above`);
    } else {
      console.log(`    Live check      : not run — pass EVAL_LIVE=true too`);
    }
  }
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

function printPacingTable(rows: FixtureEvalRow[]) {
  section(`PACING ACCURACY  (real PacingService vs ground truth, +/-${PACING_TOLERANCE_WPM} WPM)`);
  console.log(
    `  ${pad('ID', 8)} ${pad('Expected', 10, 'right')} ${pad('Actual', 10, 'right')} ` +
      `${pad('Delta', 8, 'right')} ${pad('Pass', 6, 'right')}`
  );
  console.log(`  ${'-'.repeat(46)}`);

  for (const r of rows) {
    console.log(
      `  ${pad(r.fixture.id, 8)} ${pad(r.fixture.pacingWpm, 10, 'right')} ` +
        `${pad(r.realWpm, 10, 'right')} ` +
        `${pad(r.pacingDelta, 8, 'right')} ${pad(r.pacingWithinTolerance ? 'Y' : 'N', 6, 'right')}`
    );
  }
}

function printLiveStarTable(rows: FixtureEvalRow[]) {
  section('LIVE STAR + CONFIDENCE  (real LLMInsightsService.analyse() call)');
  console.log(
    `  ${pad('ID', 8)} ${pad('Score', 8, 'right')} ${pad('InRange', 8, 'right')} ` +
      `${pad('S', 4)} ${pad('T', 4)} ${pad('A', 4)} ${pad('R', 4)} ` +
      `${pad('TeamLang', 9, 'right')} ${pad('Coach', 6, 'right')} ${pad('Pass', 6, 'right')}`
  );
  console.log(`  ${'-'.repeat(72)}`);

  for (const r of rows) {
    const live = r.liveStar;
    if (!live) {
      console.log(`  ${pad(r.fixture.id, 8)} (no live result — call failed or skipped)`);
      continue;
    }
    const flags = live.components.map((c) => pad(c.correct ? 'Y' : 'N', 4));
    console.log(
      `  ${pad(r.fixture.id, 8)} ${pad(live.confidenceScore, 8, 'right')} ` +
        `${pad(live.scoreInRange ? 'Y' : 'N', 8, 'right')} ${flags.join('')} ` +
        `${pad(live.teamLanguage.correct ? 'Y' : 'N', 9, 'right')} ` +
        `${pad(live.hasCoachingContent ? 'Y' : 'N', 6, 'right')} ` +
        `${pad(live.passed ? 'Y' : 'N', 6, 'right')}`
    );
    for (const c of live.components) {
      if (!c.correct) {
        console.log(
          `           ${c.label}: expected ${c.expectedPresent ? 'present' : 'weak/absent'}, ` +
            `LLM score ${c.llmScore}`
        );
      }
    }
    if (!live.teamLanguage.correct) {
      console.log(
        `           team language: expected ${live.teamLanguage.expected}, got ${live.teamLanguage.actual}`
      );
    }
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
  pacingAccuracy: {
    withinTolerance: boolean;
    avgDelta: number;
  };
  calibration: {
    aligned: boolean;
  };
  /** Only present when run with EVAL_LIVE=true. */
  live?: {
    passedCount: number;
    totalCount: number;
    passed: boolean;
  };
  /** Only present when run with EVAL_AUDIO=true. */
  audio?: {
    passedCount: number;
    totalCount: number;
    passed: boolean;
    fixtures: Array<{
      id: string;
      werVsBaseline: number;
      realFillerCount: number;
      realWpm: number;
      liveResult?: AudioLiveCheckResult;
      error?: string;
    }>;
  };
  details: EvalPassFail;
  perFixture: Array<{
    id: string;
    description: string;
    wer: WerDetail;
    star: StarAccuracyResult;
    filler: FillerAccuracyResult;
    realWpm: number;
    pacingDelta: number;
    calibration: CalibrationResult;
    predictedScore: number;
    liveStar?: LiveStarCheckResult;
  }>;
}

function buildReport(rows: FixtureEvalRow[]): InterviewEvalReport {
  const fixtureResults: FixtureResult[] = rows.map((r) => ({
    wer: r.wer.wer,
    actionDetected: r.star.actionDetected,
    starAccuracy: r.star.accuracy,
    fillerWithinTolerance: r.filler.withinTolerance,
    fillerDelta: r.filler.delta,
    pacingWithinTolerance: r.pacingWithinTolerance,
    calibrationAligned: r.calibration.aligned,
  }));

  const passFail = determinePassFail(fixtureResults);

  const avgDelta =
    rows.reduce((sum, r) => sum + r.filler.delta, 0) / rows.length;
  const avgPacingDelta =
    rows.reduce((sum, r) => sum + r.pacingDelta, 0) / rows.length;

  // Denominator is every fixture that SHOULD have attempted a live call, not
  // just the ones that happened to succeed — otherwise 4 failed + 1 passed
  // out of 5 would silently report "1/1 passed" instead of "1/5".
  const live = LIVE_MODE ? {
    passedCount: rows.filter((r) => r.liveStar?.passed).length,
    totalCount: rows.length,
    passed: rows.every((r) => r.liveStar?.passed === true),
  } : undefined;

  // Live mode makes the STAR/confidence checks real, so fold them into the
  // headline pass/fail once they've actually run. Synthetic-mode `passed`
  // (WER/STAR-jitter/filler/pacing) is untouched when live mode didn't run.
  const passed = passFail.passed && (live ? live.passed : true);

  return {
    generatedAt: new Date().toISOString(),
    passed,
    wer: passFail.werAverage,
    starAccuracy: passFail.starAccuracy,
    fillerAccuracy: {
      withinTolerance: passFail.fillerPassed,
      delta: avgDelta,
    },
    pacingAccuracy: {
      withinTolerance: passFail.pacingPassed,
      avgDelta: avgPacingDelta,
    },
    calibration: {
      aligned: passFail.calibrationAligned,
    },
    live,
    details: passFail,
    perFixture: rows.map((r) => ({
      id: r.fixture.id,
      description: r.fixture.description,
      wer: r.wer,
      star: r.star,
      filler: r.filler,
      realWpm: r.realWpm,
      pacingDelta: r.pacingDelta,
      calibration: r.calibration,
      predictedScore: r.predictedScore,
      liveStar: r.liveStar,
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

  if (LIVE_MODE && (!process.env.COLMAN_LLM_USERNAME || !process.env.COLMAN_LLM_PASSWORD)) {
    console.error('\n  ERROR: EVAL_LIVE=true but COLMAN_LLM_USERNAME / COLMAN_LLM_PASSWORD are not set in .env.\n');
    process.exit(1);
  }
  if (AUDIO_MODE && !process.env.OPENAI_API_KEY) {
    console.error('\n  ERROR: EVAL_AUDIO=true but OPENAI_API_KEY is not set in .env.\n');
    process.exit(1);
  }

  console.log(`  Fixtures: ${INTERVIEW_FIXTURES.length}`);
  console.log(`  Mode    : ${LIVE_MODE ? 'LIVE — STAR/confidence call the real Colman LLM' : 'hybrid — filler/pacing run the real deterministic services;'}`);
  console.log(`            ${LIVE_MODE ? `(${FIXTURE_COOLDOWN_MS}ms cooldown between fixtures)` : 'WER/STAR still use a synthetic prediction (see file header)'}`);

  const rows: FixtureEvalRow[] = [];
  for (const [i, fixture] of INTERVIEW_FIXTURES.entries()) {
    console.log(`\n  [${fixture.id}] ${fixture.description}`);
    const row = evalFixture(fixture);

    if (LIVE_MODE) {
      if (i > 0) await sleep(FIXTURE_COOLDOWN_MS);
      try {
        const llmResult = await LLMInsightsService.analyse(
          fixture.referenceTranscript,
          [], // no real Whisper segments for these text fixtures — timestamps come back null
          row.filler.actualCount,
          row.realWpm
        );
        row.liveStar = evaluateLiveStar(fixture, llmResult);
        console.log(`    -> live call ok, confidenceScore=${llmResult.confidenceScore}`);
      } catch (err) {
        console.error(`    -> live call FAILED: ${err instanceof Error ? err.message : err}`);
      }
    }

    rows.push(row);
  }

  printWerTable(rows);
  printStarTable(rows);
  printFillerTable(rows);
  printPacingTable(rows);
  if (LIVE_MODE) printLiveStarTable(rows);
  printCalibrationTable(rows);

  const audioRows: AudioFixtureRow[] = [];
  if (AUDIO_MODE) {
    for (const [i, fixture] of AUDIO_FIXTURES.entries()) {
      console.log(`\n  [audio: ${fixture.id}] ${fixture.description}`);
      if (i > 0) await sleep(FIXTURE_COOLDOWN_MS);
      try {
        const row = await evalAudioFixture(fixture);
        console.log(`    -> transcribed ok, WER vs baseline=${(row.wer.wer * 100).toFixed(1)}%`);
        audioRows.push(row);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`    -> audio fixture FAILED: ${message}`);
        audioRows.push({
          fixture,
          wer: { wer: 1, substitutions: 0, insertions: 0, deletions: 0, referenceLength: 0, hypothesisLength: 0 },
          realFillerCount: 0,
          realWpm: 0,
          durationSeconds: 0,
          error: message,
        });
      }
    }
    printAudioTable(audioRows);
  }

  const report = buildReport(rows);

  // Opting into EVAL_LIVE means the caller wants live verification. If any
  // fixture's live call didn't succeed-and-pass (e.g. VPN down), don't let
  // the synthetic-only checks silently make this look like a passing run —
  // that's a harness failure to report, not a pass. (report.live.passed
  // already requires every fixture to have succeeded AND passed.)
  if (LIVE_MODE && (!report.live || !report.live.passed)) {
    report.passed = false;
  }

  if (AUDIO_MODE) {
    // A row "passes" if transcription succeeded, WER vs baseline is within
    // drift tolerance, and — only when LIVE_MODE is also on — the live LLM
    // call both succeeded and passed its own checks. liveError (transcribed
    // fine, Colman call failed) must count as a failure here, not be
    // silently treated as "live wasn't attempted, so ignore it".
    const rowPasses = (r: AudioFixtureRow) =>
      !r.error &&
      r.wer.wer < WER_DRIFT_TOLERANCE &&
      (!LIVE_MODE || r.liveResult?.passed === true);

    report.audio = {
      passedCount: audioRows.filter(rowPasses).length,
      totalCount: audioRows.length,
      passed: audioRows.length > 0 && audioRows.every(rowPasses),
      fixtures: audioRows.map((r) => ({
        id: r.fixture.id,
        werVsBaseline: r.wer.wer,
        realFillerCount: r.realFillerCount,
        realWpm: r.realWpm,
        liveResult: r.liveResult,
        error: r.error ?? r.liveError,
      })),
    };
    // Same honesty rule as live mode: opting into EVAL_AUDIO and getting no
    // usable result (or a real drift/quality failure) must fail the run.
    if (!report.audio.passed) report.passed = false;
  }

  header('EVALUATION SUMMARY');
  console.log(`  Overall pass   : ${report.passed ? 'YES' : 'NO'}`);
  if (report.live && report.live.passedCount === 0) {
    console.log(`  WARNING        : EVAL_LIVE=true but every live call failed — see errors above`);
  } else if (report.live && !report.live.passed) {
    console.log(`  WARNING        : EVAL_LIVE=true but only ${report.live.passedCount}/${report.live.totalCount} live calls succeeded+passed — see errors above`);
  }
  console.log(`  Avg WER        : ${(report.wer * 100).toFixed(1)}%  (threshold: <15%) [synthetic prediction, text fixtures — see audio row below for the real one]`);
  console.log(`  STAR accuracy  : ${(report.starAccuracy * 100).toFixed(1)}%  [synthetic prediction]`);
  console.log(`  Action detected: ${report.details.starActionDetections}/${report.details.totalFixtures}  (need >= 4)  [synthetic prediction]`);
  console.log(`  Filler in tol. : ${report.details.fillerWithinTolerance}/${report.details.totalFixtures}  [real FillerWordService]`);
  console.log(`  Pacing in tol. : ${report.details.pacingWithinTolerance}/${report.details.totalFixtures}  [real PacingService]`);
  console.log(`  Calibration    : ${report.calibration.aligned ? 'aligned' : 'MISALIGNED'}`);
  if (report.live) {
    console.log(`  Live STAR/score: ${report.live.passedCount}/${report.live.totalCount}  [real Colman LLM call]`);
  } else {
    console.log(`  Live STAR/score: not run — pass EVAL_LIVE=true to call the real Colman LLM`);
  }
  if (report.audio) {
    console.log(`  Audio fixtures : ${report.audio.passedCount}/${report.audio.totalCount}  [REAL WhisperClient transcription + WER vs baseline]`);
  } else {
    console.log(`  Audio fixtures : not run — pass EVAL_AUDIO=true to transcribe real audio fixtures`);
  }

  const reportPath = writeJsonReport(report);
  console.log(`\n  Report saved to: ${reportPath}`);

  if (!report.passed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`\n  EVAL FAILED: ${err instanceof Error ? err.message : err}\n`);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
