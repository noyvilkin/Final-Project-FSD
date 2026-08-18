/**
 * Real-audio fixtures for the interview eval — as opposed to fixtures.ts's
 * hand-written text fixtures, these point at an actual recording and are
 * run through the REAL WhisperClient, not a synthetic prediction.
 *
 * WER ground truth here is a stored baseline transcript from a real
 * transcription run, NOT an independently human-verified reference. There
 * was no way to get a true independent transcript without a human listening
 * to and transcribing the audio by hand, so this measures DRIFT from that
 * baseline (did Whisper's output change since we captured it — a model
 * version change, a provider swap, a regression) rather than absolute
 * transcription accuracy. Still a real, useful regression signal — just an
 * honest one about what it actually catches.
 *
 * These fixtures also have no STAR ground truth (see liveStarCheck.ts for
 * that): the recording is a multi-topic technical Q&A, not a single
 * behavioral story, so a clean situation/task/action/result map doesn't
 * apply. audioLiveCheck.ts runs a looser plausibility check instead.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const BACKEND_ROOT = path.resolve(__dirname, '../../../../');

export const AUDIO_FIXTURES_BASE_PATH = path.join(
  BACKEND_ROOT,
  'src/features/interview/tests/audio-fixtures'
);

export interface AudioFixture {
  id: string;
  description: string;
  /** Filename within AUDIO_FIXTURES_BASE_PATH. */
  fileName: string;
  /** Filename of the stored baseline transcript JSON, same directory. */
  baselineFileName: string;
  /**
   * The candidate is expected to speak mostly in first person ("I") — used
   * by audioLiveCheck.ts to sanity-check that the live LLM call correctly
   * focused on the candidate's turns in this two-speaker dialogue, not the
   * interviewer's.
   */
  expectCandidatePersonalAgency: boolean;
}

export const AUDIO_FIXTURES: AudioFixture[] = [
  {
    id: 'iv-real-01',
    description:
      'Real recording: technical Q&A mock interview ("Full Stack Software Developer at Google - Mid") — ' +
      'two speakers (interviewer + candidate), ~5.5 min, no single STAR narrative',
    fileName: 'Full Stack Software Developer at Google - Mid.mp3',
    baselineFileName: 'iv-real-01.baseline.json',
    expectCandidatePersonalAgency: true,
  },
];

export function audioPathFor(fixture: AudioFixture): string {
  return path.join(AUDIO_FIXTURES_BASE_PATH, fixture.fileName);
}

export interface BaselineTranscript {
  text: string;
  segments: Array<{ start: number; end: number; text: string }>;
  language: string;
  durationSeconds: number;
}

export function loadBaseline(fixture: AudioFixture): BaselineTranscript {
  const p = path.join(AUDIO_FIXTURES_BASE_PATH, fixture.baselineFileName);
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}
