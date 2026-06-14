/**
 * Filler Word Detection Service
 *
 * Pure text-analysis service (no LLM calls) that detects and counts filler words
 * in interview transcripts. Returns structured IFillerWords data compatible with
 * the interviewInsights model.
 */

/** Matches the IFillerWord interface from interviewInsights.model */
export interface FillerWordEntry {
  word: string;
  count: number;
}

/** Matches the IFillerWords interface from interviewInsights.model */
export interface FillerWordsResult {
  totalCount: number;
  ratePerMinute: number;
  examples: FillerWordEntry[];
}

/**
 * Default filler-word patterns ordered from longest to shortest so that
 * multi-word fillers are matched before their single-word substrings.
 *
 * Each pattern is matched as a whole word/phrase (word-boundary aware).
 */
const DEFAULT_FILLER_PHRASES: string[] = [
  'you know what I mean',
  'at the end of the day',
  'if you will',
  'you know',
  'I mean',
  'sort of',
  'kind of',
  'more or less',
  'as a matter of fact',
  'basically',
  'actually',
  'literally',
  'honestly',
  'like',
  'um',
  'uh',
  'hmm',
  'er',
  'ah',
  'well',
  'right',
  'okay',
  'so',
];

/**
 * Build a word-boundary-aware RegExp for a filler phrase.
 * Handles both single words and multi-word phrases.
 */
function buildFillerRegex(phrase: string): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'gi');
}

/**
 * Context-aware filter: returns true if the match at `index` is likely a
 * *structural* use of the word rather than a filler.
 *
 * For example, "like" in "I like coding" is not a filler, but "It was, like,
 * really hard" is. We use simple heuristics based on surrounding words.
 */
function isStructuralUse(
  word: string,
  transcript: string,
  matchIndex: number,
): boolean {
  const lowerWord = word.toLowerCase();

  // Only apply context filtering to ambiguous single words
  if (!['like', 'so', 'well', 'right', 'okay'].includes(lowerWord)) {
    return false;
  }

  // Extract a window of text around the match for context
  const windowStart = Math.max(0, matchIndex - 40);
  const windowEnd = Math.min(transcript.length, matchIndex + word.length + 40);
  const context = transcript.slice(windowStart, windowEnd).toLowerCase();
  const beforeMatch = transcript.slice(windowStart, matchIndex).toLowerCase().trim();
  const afterMatch = transcript
    .slice(matchIndex + word.length, windowEnd)
    .toLowerCase()
    .trim();

  switch (lowerWord) {
    case 'like': {
      // "I like X", "would like", "looks like", "feels like" => structural
      if (/\b(i|we|they|you|he|she|it|would|could|should|looks?|feels?|seems?|sounds?)\s*$/.test(beforeMatch)) {
        return true;
      }
      // "like a", "like the", "like this/that" at start of clause => structural comparison
      if (/^(like)\b/.test(context.slice(matchIndex - windowStart)) && /^\s+(a|an|the|this|that|those|these)\b/.test(afterMatch)) {
        // Could be filler ("it was like a disaster") or structural — lean structural
        // only if preceded by verb
        if (/\b(is|was|are|were|be|been|being|look|seem|feel|sound|appear)\s*$/.test(beforeMatch)) {
          return true;
        }
      }
      return false;
    }
    case 'so': {
      // "so that", "so much", "so many", "so far" => structural intensifier/conjunction
      if (/^\s*(that|much|many|far|few|long|often|quickly)\b/.test(afterMatch)) {
        return true;
      }
      // At the very start of a sentence after a period => likely filler
      // After "and so", "but so" => filler
      return false;
    }
    case 'well': {
      // "as well", "well-known", "well enough", "doing well" => structural
      if (/\b(as|doing|went|very|quite)\s*$/.test(beforeMatch)) {
        return true;
      }
      if (/^[-]/.test(afterMatch)) {
        return true; // "well-known" etc.
      }
      return false;
    }
    case 'right': {
      // "right now", "right away", "right there", "that's right", "the right" => structural
      if (/^\s*(now|away|there|here|thing|place|time|answer|direction|decision)\b/.test(afterMatch)) {
        return true;
      }
      if (/\b(the|that's|that is|is|was|are|were)\s*$/.test(beforeMatch)) {
        return true;
      }
      return false;
    }
    case 'okay': {
      // "okay" at start of response or after a pause is filler
      // "it was okay" => structural
      if (/\b(was|is|are|were|be|been|it's|that's|seems?|looks?|feels?)\s*$/.test(beforeMatch)) {
        return true;
      }
      return false;
    }
    default:
      return false;
  }
}

export interface FillerDetectionOptions {
  /** Custom list of filler phrases (overrides defaults) */
  fillerPhrases?: string[];
  /** Duration of the transcript in minutes (for rate calculation) */
  durationMinutes?: number;
  /** Estimated words-per-minute for duration estimation when durationMinutes is not provided */
  estimatedWpm?: number;
}

/**
 * Analyze a transcript for filler words.
 *
 * @param transcript  The full interview transcript text
 * @param options     Optional configuration
 * @returns           Structured filler-word analysis
 */
export function detectFillerWords(
  transcript: string,
  options: FillerDetectionOptions = {},
): FillerWordsResult {
  if (!transcript || transcript.trim().length === 0) {
    return { totalCount: 0, ratePerMinute: 0, examples: [] };
  }

  const phrases = options.fillerPhrases ?? DEFAULT_FILLER_PHRASES;
  const counts = new Map<string, number>();

  // We need to track which character positions have already been claimed
  // by a longer phrase so shorter phrases don't double-count.
  const claimed = new Set<number>();

  // Sort phrases longest-first so multi-word phrases get priority
  const sorted = [...phrases].sort((a, b) => b.length - a.length);

  for (const phrase of sorted) {
    const regex = buildFillerRegex(phrase);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(transcript)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      // Skip if any character in this range was already claimed
      let overlaps = false;
      for (let i = start; i < end; i++) {
        if (claimed.has(i)) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) continue;

      // Skip structural uses of ambiguous words
      if (isStructuralUse(phrase, transcript, start)) continue;

      // Claim the range
      for (let i = start; i < end; i++) {
        claimed.add(i);
      }

      const canonical = phrase.toLowerCase();
      counts.set(canonical, (counts.get(canonical) ?? 0) + 1);
    }
  }

  // Build examples sorted by count descending
  const examples: FillerWordEntry[] = Array.from(counts.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count);

  const totalCount = examples.reduce((sum, e) => sum + e.count, 0);

  // Estimate duration if not provided
  let durationMinutes = options.durationMinutes;
  if (!durationMinutes || durationMinutes <= 0) {
    const wpm = options.estimatedWpm ?? 150; // average speaking pace
    const wordCount = transcript.split(/\s+/).filter(w => w.length > 0).length;
    durationMinutes = Math.max(wordCount / wpm, 0.1); // floor at 6 seconds
  }

  const ratePerMinute = Math.round((totalCount / durationMinutes) * 10) / 10;

  return { totalCount, ratePerMinute, examples };
}
