/**
 * Lightweight text sanitiser – strips noise so downstream LLM calls
 * receive the minimum tokens required to preserve semantic meaning.
 */

const HEADER_FOOTER_PATTERNS: RegExp[] = [
  /^page\s*\d+\s*(of\s*\d+)?$/gim,
  /^\s*confidential\b.*$/gim,
  /^\s*draft\b.*$/gim,
  /^\s*©.*$/gim,
  /^\s*all\s+rights\s+reserved.*$/gim,
  /^\s*proprietary\b.*$/gim,
  /^\s*document\s+(version|rev(ision)?)\s*[:.]?\s*\S.*$/gim,
  /^\s*last\s+(updated|modified)\s*[:.]?\s*\S.*$/gim,
  /^\s*printed\s+on\s*[:.]?\s*\S.*$/gim,
  /^\s*table\s+of\s+contents\s*$/gim,
  /^\s*-{3,}\s*$/gm,
  /^\s*={3,}\s*$/gm,
  /^\s*_{3,}\s*$/gm,
];

const stripHeadersFooters = (text: string): string => {
  let result = text;
  for (const pattern of HEADER_FOOTER_PATTERNS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, "");
  }
  return result;
};

const collapseWhitespace = (text: string): string => {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^ +| +$/gm, "")
    .trim();
};

const stripFormattingArtifacts = (text: string): string => {
  return text
    .replace(/\u00a0/g, " ")      // non-breaking space
    .replace(/[\u200b-\u200d\ufeff]/g, "")  // zero-width chars / BOM
    .replace(/•/g, "-")           // fancy bullets → plain dash
    .replace(/[""]/g, '"')        // smart quotes → straight
    .replace(/['']/g, "'")
    .replace(/…/g, "...")
    .replace(/–/g, "-")           // en-dash
    .replace(/—/g, "-");          // em-dash
};

export interface SanitizeOptions {
  stripHeaders?: boolean;
  collapseWs?: boolean;
  stripFormatting?: boolean;
}

const DEFAULTS: Required<SanitizeOptions> = {
  stripHeaders: true,
  collapseWs: true,
  stripFormatting: true,
};

/**
 * Clean raw extracted text for efficient LLM consumption.
 *
 * Pipeline order:
 *  1. Replace formatting artefacts (smart quotes, zero-width chars, etc.)
 *  2. Strip common header / footer lines (page numbers, "Confidential", etc.)
 *  3. Collapse excessive whitespace and blank lines
 */
export const sanitizeText = (
  raw: string,
  opts: SanitizeOptions = {}
): string => {
  const config = { ...DEFAULTS, ...opts };

  let text = raw;

  if (config.stripFormatting) {
    text = stripFormattingArtifacts(text);
  }
  if (config.stripHeaders) {
    text = stripHeadersFooters(text);
  }
  if (config.collapseWs) {
    text = collapseWhitespace(text);
  }

  return text;
};
