/**
 * Ground-truth test fixtures for the interview STAR benchmark.
 *
 * Each fixture simulates what the multimodal pipeline would produce:
 * a transcript, STAR segment labels, filler word counts, pacing, and
 * expected confidence scores.
 *
 * Since we cannot record real audio in CI, these are text-based fixtures
 * that represent the *output* of the transcription + analysis pipeline.
 */

// ── STAR segment types ─────────────────────────────────────────────

export type StarLabel = 'situation' | 'task' | 'action' | 'result';

export interface StarSegment {
  label: StarLabel;
  /** Inclusive start word index in the transcript (0-based). */
  startWord: number;
  /** Inclusive end word index in the transcript (0-based). */
  endWord: number;
  /** Optional time range for future media-based fixtures. */
  timeRange?: { startSec: number; endSec: number };
}

// ── Filler word ground truth ───────────────────────────────────────

export interface FillerWordTruth {
  word: string;
  count: number;
}

export interface FillerWordsSummary {
  totalCount: number;
  ratePerMinute: number;
  examples: FillerWordTruth[];
}

// ── Sentiment / pacing ground truth ────────────────────────────────

export interface SentimentTruth {
  overallTone: 'confident' | 'neutral' | 'hesitant';
  clarityScore: number;
}

// ── Full fixture ───────────────────────────────────────────────────

export interface InterviewFixture {
  id: string;
  description: string;
  /** The "ground truth" reference transcript (manually verified). */
  referenceTranscript: string;
  /** Ground-truth STAR segment map. */
  starMap: StarSegment[];
  /** Ground-truth filler word counts. */
  fillerWords: FillerWordsSummary;
  /** Ground-truth sentiment / pacing. */
  sentiment: SentimentTruth;
  /** Expected overall confidence score range [min, max] (0-100). */
  expectedScoreRange: { min: number; max: number };
  /** Words per minute (ground truth). */
  pacingWpm: number;
  /** Duration of the clip in seconds (for rate calculations). */
  durationSec: number;
}

// ── Fixtures ───────────────────────────────────────────────────────

export const INTERVIEW_FIXTURES: InterviewFixture[] = [
  // ---- fixture 1: strong STAR response, minimal fillers ----
  {
    id: 'iv-01',
    description: 'Strong STAR answer about leading a database migration — clear segments, few fillers',
    referenceTranscript:
      'In my previous role at Acme Corp we faced a critical database migration deadline. ' +
      'The legacy MySQL system was running out of capacity and we had three months to migrate to PostgreSQL. ' +
      'My task was to design the migration strategy and coordinate between the backend and DevOps teams. ' +
      'I personally wrote the schema translation scripts and set up a parallel-run environment to validate data integrity. ' +
      'I also organized daily standups to track blockers. ' +
      'As a result we completed the migration two weeks early with zero data loss and 99.9 percent uptime during the cutover.',
    starMap: [
      { label: 'situation', startWord: 0, endWord: 22 },
      { label: 'task', startWord: 23, endWord: 40 },
      { label: 'action', startWord: 41, endWord: 68 },
      { label: 'result', startWord: 69, endWord: 90 },
    ],
    fillerWords: {
      totalCount: 0,
      ratePerMinute: 0,
      examples: [],
    },
    sentiment: { overallTone: 'confident', clarityScore: 92 },
    expectedScoreRange: { min: 80, max: 100 },
    pacingWpm: 145,
    durationSec: 45,
  },

  // ---- fixture 2: good structure but "we" heavy in Action ----
  {
    id: 'iv-02',
    description: 'Team-heavy Action section — AI should still detect Action but may flag "we" vs "I"',
    referenceTranscript:
      'So um at my last company the mobile app had a lot of crashes on Android. ' +
      'We needed to um reduce the crash rate below one percent within the quarter. ' +
      'We investigated the crash logs and we found that the image loading library was leaking memory. ' +
      'We replaced it with Glide and we added automated memory profiling to the CI pipeline. ' +
      'The crash rate dropped to 0.3 percent and user retention improved by twelve percent.',
    starMap: [
      { label: 'situation', startWord: 0, endWord: 16 },
      { label: 'task', startWord: 17, endWord: 30 },
      { label: 'action', startWord: 31, endWord: 56 },
      { label: 'result', startWord: 57, endWord: 72 },
    ],
    fillerWords: {
      totalCount: 3,
      ratePerMinute: 4.5,
      examples: [
        { word: 'um', count: 2 },
        { word: 'so', count: 1 },
      ],
    },
    sentiment: { overallTone: 'neutral', clarityScore: 72 },
    expectedScoreRange: { min: 55, max: 80 },
    pacingWpm: 130,
    durationSec: 40,
  },

  // ---- fixture 3: weak / missing Result ----
  {
    id: 'iv-03',
    description: 'Missing Result segment — candidate trails off without quantifiable outcome',
    referenceTranscript:
      'Um so basically like our team had this problem where the deployment process took like four hours every time. ' +
      'I was asked to like automate the whole thing basically. ' +
      'So um I looked at Jenkins and I set up a pipeline with Docker containers um and I wrote some bash scripts. ' +
      'Yeah so um it was like it got better I think the team was happier after that.',
    starMap: [
      { label: 'situation', startWord: 0, endWord: 18 },
      { label: 'task', startWord: 19, endWord: 29 },
      { label: 'action', startWord: 30, endWord: 52 },
      // No proper result — the last sentence is vague
    ],
    fillerWords: {
      totalCount: 10,
      ratePerMinute: 15.0,
      examples: [
        { word: 'um', count: 3 },
        { word: 'like', count: 4 },
        { word: 'so', count: 2 },
        { word: 'basically', count: 1 },
      ],
    },
    sentiment: { overallTone: 'hesitant', clarityScore: 45 },
    expectedScoreRange: { min: 25, max: 50 },
    pacingWpm: 155,
    durationSec: 40,
  },

  // ---- fixture 4: excellent response with minor transcription challenges ----
  {
    id: 'iv-04',
    description: 'Technical STAR answer with domain jargon — tests transcription fidelity',
    referenceTranscript:
      'At FinTech Global our real-time fraud detection system was generating too many false positives about eighteen percent. ' +
      'I was tasked with reducing the false positive rate to under five percent without increasing false negatives. ' +
      'I redesigned the feature engineering pipeline using XGBoost instead of the existing logistic regression model. ' +
      'I also implemented a two-stage scoring system where low-confidence predictions were routed to a human review queue. ' +
      'After three months the false positive rate dropped to 3.2 percent and we saved approximately two million dollars annually in manual review costs.',
    starMap: [
      { label: 'situation', startWord: 0, endWord: 18 },
      { label: 'task', startWord: 19, endWord: 35 },
      { label: 'action', startWord: 36, endWord: 67 },
      { label: 'result', startWord: 68, endWord: 93 },
    ],
    fillerWords: {
      totalCount: 0,
      ratePerMinute: 0,
      examples: [],
    },
    sentiment: { overallTone: 'confident', clarityScore: 95 },
    expectedScoreRange: { min: 85, max: 100 },
    pacingWpm: 140,
    durationSec: 50,
  },

  // ---- fixture 5: filler-heavy with confused structure ----
  {
    id: 'iv-05',
    description: 'Rambling answer — poor structure, heavy fillers, action mixed with situation',
    referenceTranscript:
      'Yeah so um you know we had this uh customer support thing where like tickets were piling up right. ' +
      'And uh I guess I was supposed to like fix it or whatever. ' +
      'So uh you know I talked to some people and like we tried some stuff um with Zendesk I think. ' +
      'And um yeah it kind of worked out I guess the numbers went down or something.',
    starMap: [
      { label: 'situation', startWord: 0, endWord: 18 },
      { label: 'task', startWord: 19, endWord: 31 },
      { label: 'action', startWord: 32, endWord: 51 },
      // Result is vague / not quantified
    ],
    fillerWords: {
      totalCount: 14,
      ratePerMinute: 21.0,
      examples: [
        { word: 'um', count: 3 },
        { word: 'uh', count: 3 },
        { word: 'like', count: 3 },
        { word: 'you know', count: 2 },
        { word: 'so', count: 1 },
        { word: 'yeah', count: 1 },
        { word: 'I guess', count: 1 },
      ],
    },
    sentiment: { overallTone: 'hesitant', clarityScore: 30 },
    expectedScoreRange: { min: 10, max: 35 },
    pacingWpm: 160,
    durationSec: 40,
  },
];
