/**
 * Break a concatenated experience description (verbatim bullets joined
 * with spaces/newlines) into individual bullet lines: split on common
 * bullet glyphs first, then on sentence boundaries.
 *
 * Shared by the optimizer (so each bullet is rewritten independently)
 * and the docx composer (so accepted rewrites map back to the exact
 * original bullet). Both MUST split identically for that mapping to hold.
 */
export function splitBullets(text: string): string[] {
  if (!text || !text.trim()) return [];

  const normalized = text
    .replace(/\r/g, '\n')
    .replace(/\s*[•▪◦‣·]\s*/g, '\n')
    .replace(/\n\s*[-–]\s+/g, '\n');

  const lines = normalized
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const out: string[] = [];
  for (const line of lines) {
    const sentences = line
      .split(/(?<=[.!?])\s+(?=[A-Z(])/)
      .map((s) => s.trim())
      .filter(Boolean);
    out.push(...(sentences.length > 0 ? sentences : [line]));
  }

  return out
    .map((s) => s.replace(/^[-–•▪◦‣·]\s*/, '').trim())
    .filter((s) => s.length > 1);
}
