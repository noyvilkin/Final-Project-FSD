import type { IFillerWordBreakdown } from '../models/interviewInsights.model.js';

// ─── Filler word list ─────────────────────────────────────────────────────────

/**
 * Ordered from multi-word phrases to single words so that longer patterns
 * are matched first and don't get split by single-word passes.
 */
const FILLER_PHRASES: string[] = [
  'you know',
  'kind of',
  'sort of',
  'um',
  'uh',
  'like',
  'basically',
  'actually',
];

// ─── Result type ──────────────────────────────────────────────────────────────

export interface FillerWordResult {
  totalCount:  number;
  breakdown:   IFillerWordBreakdown[];
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Deterministic filler-word counter.
 * Uses word-boundary-safe regex to avoid false positives inside other words
 * (e.g. "actually" must not match inside "practically").
 *
 * Pure function — no I/O, fully unit-testable.
 */
export class FillerWordService {
  /**
   * Count filler words and phrases in a transcript.
   *
   * @param transcript  Plain-text transcript string.
   * @returns           Total count and per-filler breakdown (zero-count fillers excluded).
   */
  static count(transcript: string): FillerWordResult {
    const normalised = transcript.toLowerCase();
    const breakdown:  IFillerWordBreakdown[] = [];
    let   totalCount = 0;

    for (const filler of FILLER_PHRASES) {
      const pattern = FillerWordService.buildPattern(filler);
      const matches = normalised.match(pattern);
      const cnt     = matches ? matches.length : 0;

      if (cnt > 0) {
        breakdown.push({ word: filler, count: cnt });
        totalCount += cnt;
      }
    }

    // Sort descending by count for convenient display
    breakdown.sort((a, b) => b.count - a.count);

    return { totalCount, breakdown };
  }

  // ── private ──────────────────────────────────────────────────────────────

  /**
   * Build a global, case-insensitive, word-boundary-safe regex for a phrase.
   *
   * Multi-word phrases (e.g. "you know") use \b on both ends of the whole
   * phrase so "do you know" still matches "you know" as a sub-phrase but
   * "young" does not match "you".
   */
  private static buildPattern(phrase: string): RegExp {
    // Escape any regex special chars in the phrase
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Replace space(s) in the phrase with flexible whitespace matcher
    const spaced  = escaped.replace(/ +/g, '\\s+');

    if (phrase === 'like') {
      return new RegExp(`${FillerWordService.LIKE_EXCLUSIONS}\\b${spaced}\\b`, 'gi');
    }

    return new RegExp(`\\b${spaced}\\b`, 'gi');
  }

  /**
   * "like" is the noisiest filler to detect lexically: it's also a genuine
   * verb ("I'd like to", "would like") and follows perception/copular verbs
   * as a real comparison ("feels/looks/seems/sounds like"), neither of which
   * is a disfluency. This lookbehind excludes those two well-defined,
   * generalizable cases.
   *
   * It does NOT catch every non-filler use — "a company like REI" (simple
   * comparison) still counts, since distinguishing that from disfluency
   * "like" needs part-of-speech context a lexical regex can't infer without
   * risking false negatives on real fillers elsewhere.
   */
  private static readonly LIKE_EXCLUSIONS =
    "(?<!would )(?<!wouldn't )(?<!'d )" +
    '(?<!feel )(?<!feels )(?<!felt )' +
    '(?<!look )(?<!looks )(?<!looked )' +
    '(?<!seem )(?<!seems )(?<!seemed )' +
    '(?<!sound )(?<!sounds )(?<!sounded )';
}
