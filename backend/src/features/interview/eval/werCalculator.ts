/**
 * Word Error Rate (WER) calculator.
 *
 * Uses the standard Levenshtein edit-distance algorithm at the word level:
 *   WER = (substitutions + insertions + deletions) / reference_word_count
 *
 * Convention: WER can exceed 1.0 when the hypothesis is much longer than
 * the reference.  A WER of 0 means a perfect match.
 */

// ── Helpers ────────────────────────────────────────────────────────

/** Normalise text for comparison: lowercase, collapse whitespace, strip punctuation. */
export function normaliseTranscript(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s'-]/g, '')   // keep apostrophes and hyphens within words
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length > 0);
}

// ── Edit distance (word-level) ─────────────────────────────────────

export interface WerDetail {
  /** Word Error Rate (0 = perfect, can be >1 if hypothesis is longer). */
  wer: number;
  substitutions: number;
  insertions: number;
  deletions: number;
  referenceLength: number;
  hypothesisLength: number;
}

/**
 * Compute the word-level edit distance between two token arrays using
 * the Wagner-Fischer dynamic-programming algorithm.
 */
function wordEditDistance(
  ref: string[],
  hyp: string[]
): { distance: number; substitutions: number; insertions: number; deletions: number } {
  const n = ref.length;
  const m = hyp.length;

  // dp[i][j] = edit distance between ref[0..i-1] and hyp[0..j-1]
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));

  // Back-pointers: 'S' = sub/match, 'I' = insertion, 'D' = deletion
  const op: string[][] = Array.from({ length: n + 1 }, () => new Array<string>(m + 1).fill(''));

  for (let i = 0; i <= n; i++) {
    dp[i][0] = i;
    op[i][0] = 'D';
  }
  for (let j = 0; j <= m; j++) {
    dp[0][j] = j;
    op[0][j] = 'I';
  }
  op[0][0] = '';

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const subCost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      const costs = [
        dp[i - 1][j - 1] + subCost, // substitution (or match)
        dp[i][j - 1] + 1,           // insertion
        dp[i - 1][j] + 1,           // deletion
      ];
      const minCost = Math.min(...costs);
      dp[i][j] = minCost;

      if (minCost === costs[0]) op[i][j] = 'S';
      else if (minCost === costs[1]) op[i][j] = 'I';
      else op[i][j] = 'D';
    }
  }

  // Trace back to count S/I/D
  let substitutions = 0;
  let insertions = 0;
  let deletions = 0;
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (op[i][j] === 'S') {
      if (ref[i - 1] !== hyp[j - 1]) substitutions++;
      i--;
      j--;
    } else if (op[i][j] === 'I') {
      insertions++;
      j--;
    } else {
      deletions++;
      i--;
    }
  }

  return { distance: dp[n][m], substitutions, insertions, deletions };
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Calculate Word Error Rate between a reference transcript and a
 * hypothesis (predicted) transcript.
 *
 * Both inputs are raw strings; normalisation is applied internally.
 */
export function calculateWer(reference: string, hypothesis: string): WerDetail {
  const refTokens = normaliseTranscript(reference);
  const hypTokens = normaliseTranscript(hypothesis);

  if (refTokens.length === 0) {
    return {
      wer: hypTokens.length === 0 ? 0 : Infinity,
      substitutions: 0,
      insertions: hypTokens.length,
      deletions: 0,
      referenceLength: 0,
      hypothesisLength: hypTokens.length,
    };
  }

  const { substitutions, insertions, deletions } = wordEditDistance(refTokens, hypTokens);

  return {
    wer: (substitutions + insertions + deletions) / refTokens.length,
    substitutions,
    insertions,
    deletions,
    referenceLength: refTokens.length,
    hypothesisLength: hypTokens.length,
  };
}
