import { PdfProcessor } from '../../../common/utils/pdfProcessor.js';
import { appLogger } from '../../../common/services/logger.js';
import type { NormalizedJD, NormalizationMetrics } from '../types/resumeOptimization.types.js';

/**
 * Accepts raw JD text or a PDF buffer and produces a token-efficient
 * clean string suitable for downstream NLP and AI consumption.
 */
export class JdIngestionService {

  // ── Public API ──────────────────────────────────────────────────

  static async fromPdf(pdfBuffer: Buffer): Promise<NormalizedJD> {
    const extraction = await PdfProcessor.extractTextFromPdf(pdfBuffer);

    if (!extraction.success || !extraction.extractedText) {
      throw new Error(
        `PDF extraction failed: ${extraction.errors.join('; ') || 'empty document'}`
      );
    }

    return this.fromText(extraction.extractedText);
  }

  static fromText(rawText: string): NormalizedJD {
    if (!rawText || rawText.trim().length === 0) {
      throw new Error('JD text is empty');
    }

    const original = rawText;
    const cleaned  = this.normalize(original);
    const metrics  = this.computeMetrics(original, cleaned);

    appLogger.info('JD normalization complete', {
      originalLen: metrics.originalLength,
      cleanedLen:  metrics.cleanedLength,
      reduction:   `${metrics.reductionPercent}%`,
    });

    return { cleanText: cleaned, originalText: original, metrics };
  }

  // ── Normalization pipeline ──────────────────────────────────────

  private static normalize(text: string): string {
    let result = text;

    result = this.stripHtml(result);
    result = this.stripUrls(result);
    result = this.stripNonStandardChars(result);
    result = this.stripBoilerplate(result);
    result = this.collapseWhitespace(result);

    return result.trim();
  }

  // ── Individual filters ──────────────────────────────────────────

  private static stripHtml(text: string): string {
    return text
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(p|div|li|tr|td|th|h[1-6]|blockquote|section|article|header|footer|nav|ul|ol)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&[a-z]+;/gi, ' ');
  }

  private static stripUrls(text: string): string {
    return text
      .replace(/https?:\/\/[^\s)]+/gi, '')
      .replace(/www\.[^\s)]+/gi, '')
      .replace(/\S+@\S+\.\S+/g, '');
  }

  private static stripNonStandardChars(text: string): string {
    return text
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\u2026/g, '...')
      .replace(/[\u00A0]/g, ' ')
      .replace(/[^\x20-\x7E\n\r\t•·–—''""…°±×÷©®™€£¥₹¢]/g, ' ');
  }

  private static readonly BOILERPLATE_PATTERNS: RegExp[] = [
    /equal\s+opportunity\s+employer[^\n]*/gi,
    /we\s+are\s+an?\s+equal\s+opportunity[^\n]*/gi,
    /EOE[/\s]*(M\/F\/D\/V|Minorities\/Females\/Veterans\/Disabled)[^\n]*/gi,
    /affirmative\s+action[^\n]*/gi,
    /all\s+qualified\s+applicants\s+will\s+receive\s+consideration[^\n]*/gi,
    /we\s+do\s+not\s+discriminate[^\n]*/gi,
    /this\s+company\s+is\s+an?\s+equal[^\n]*/gi,
    /we\s+celebrate\s+diversity[^\n]*/gi,
    /reasonable\s+accommodation[^\n]*/gi,
    /applicants?\s+with\s+disabilities[^\n]*/gi,
    /background\s+check\s+(is\s+)?required[^\n]*/gi,
    /drug[\s-]?free\s+workplace[^\n]*/gi,
    /pre[\s-]?employment\s+(drug\s+)?screening[^\n]*/gi,
    /salary\s+range\s*:?\s*\$[\d,.]+ ?[-–] ?\$[\d,.]+[^\n]*/gi,
    /compensation\s*:?\s*\$[\d,.]+ ?[-–] ?\$[\d,.]+[^\n]*/gi,
    /click\s+(here\s+)?to\s+apply[^\n]*/gi,
    /apply\s+now[^\n]*/gi,
    /submit\s+your\s+(resume|application|cv)[^\n]*/gi,
    /visit\s+our\s+(career|careers)\s+page[^\n]*/gi,
    /follow\s+us\s+on\s+(linkedin|twitter|facebook|instagram)[^\n]*/gi,
  ];

  private static stripBoilerplate(text: string): string {
    let result = text;
    for (const pattern of this.BOILERPLATE_PATTERNS) {
      result = result.replace(pattern, '');
    }
    return result;
  }

  private static collapseWhitespace(text: string): string {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n');
  }

  // ── Metrics ─────────────────────────────────────────────────────

  private static computeMetrics(original: string, cleaned: string): NormalizationMetrics {
    const originalLength = original.length;
    const cleanedLength  = cleaned.length;
    const reductionPercent = originalLength > 0
      ? Math.round(((originalLength - cleanedLength) / originalLength) * 100)
      : 0;

    return {
      originalLength,
      cleanedLength,
      reductionPercent,
      strippedHtml:        /<[^>]+>/.test(original),
      strippedBoilerplate: this.BOILERPLATE_PATTERNS.some(p => p.test(original)),
    };
  }
}
