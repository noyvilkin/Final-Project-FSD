import { appLogger } from '../services/logger.js';

interface PdfParseResult {
  text: string;
  numpages: number;
}

type PdfParseFn = (buffer: Buffer) => Promise<PdfParseResult>;

let pdfParseLoader: Promise<PdfParseFn> | null = null;

/**
 * Lazily loads pdf-parse.
 *
 * The implementation is imported from lib/ rather than the package root on purpose: the
 * root index.js treats a falsy `module.parent` as "debug mode" and, at load time, reads a
 * sample PDF from a path relative to the process cwd — which throws ENOENT and takes every
 * extraction down with it. Importing lib/ skips that block, and deferring the import keeps
 * this file loadable under the CommonJS test transform so extraction can be unit tested.
 */
async function loadPdfParse(): Promise<PdfParseFn> {
  if (!pdfParseLoader) {
    pdfParseLoader = import('pdf-parse/lib/pdf-parse.js').then((mod) => {
      const candidate = (mod as unknown as { default?: PdfParseFn }).default ?? mod;
      return candidate as unknown as PdfParseFn;
    });
  }
  return pdfParseLoader;
}

export interface PdfExtractionResult {
  success: boolean;
  extractedText: string;
  normalizedText: string;
  metadata: {
    totalPages: number;
    originalLength: number;
    normalizedLength: number;
    hasImages: boolean;
  };
  errors: string[];
}

export class PdfProcessor {
  /**
   * Extract and normalize text from a PDF buffer
   */
  static async extractTextFromPdf(pdfBuffer: Buffer): Promise<PdfExtractionResult> {
    const result: PdfExtractionResult = {
      success: false,
      extractedText: '',
      normalizedText: '',
      metadata: {
        totalPages: 0,
        originalLength: 0,
        normalizedLength: 0,
        hasImages: false
      },
      errors: []
    };

    try {
      // Extract text from PDF
      const pdfParse = await loadPdfParse();
      const data = await pdfParse(pdfBuffer);
      
      const rawText = data.text ?? '';
      result.extractedText = rawText;
      result.metadata.totalPages = data.numpages;
      result.metadata.originalLength = rawText.length;

      // A whitespace-only payload means pdfjs found no glyphs (image-only scan, or a
      // damaged content stream it recovered from without throwing). Length alone is not
      // enough — these files commonly come back as "\n\n".
      if (rawText.trim().length === 0) {
        result.errors.push(
          'No text content found in PDF — the file may be image-only, encrypted, or corrupt'
        );
        return result;
      }

      // Normalize the extracted text
      result.normalizedText = this.normalizeText(rawText);
      result.metadata.normalizedLength = result.normalizedText.length;

      // Normalization strips page furniture; if it consumed everything, there is no
      // rubric left to grade against and the caller must not treat this as a success.
      if (result.normalizedText.trim().length === 0) {
        result.errors.push('PDF contained no usable text after normalization');
        return result;
      }
      
      // Check for images (basic heuristic)
      result.metadata.hasImages = data.text.includes('[image]') || 
                                  data.text.includes('Figure') ||
                                  data.text.includes('Image') ||
                                  data.text.includes('Diagram');

      result.success = true;
      
      appLogger.info('PDF text extraction successful', {
        pages: result.metadata.totalPages,
        originalLength: result.metadata.originalLength,
        normalizedLength: result.metadata.normalizedLength
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown PDF processing error';
      result.errors.push(`PDF processing failed: ${message}`);
      appLogger.error('PDF text extraction failed:', error);
    }

    return result;
  }

  /**
   * Normalize extracted text by removing formatting noise and standardizing structure
   */
  private static normalizeText(text: string): string {
    let normalized = text;

    // Remove excessive whitespace and normalize line breaks
    normalized = normalized.replace(/\r\n/g, '\n')           // Standardize line endings
                          .replace(/\r/g, '\n')              // Handle remaining \r
                          .replace(/\n{3,}/g, '\n\n')        // Limit consecutive newlines to max 2
                          .replace(/[ \t]+/g, ' ')           // Normalize spaces and tabs
                          .replace(/ +\n/g, '\n')            // Remove trailing spaces before newlines
                          .replace(/\n +/g, '\n');           // Remove leading spaces after newlines

    // Remove page headers/footers (common patterns)
    normalized = this.removePageHeadersFooters(normalized);

    // Remove table of contents patterns
    normalized = this.removeTableOfContents(normalized);

    // Clean up bullet points and numbering
    normalized = this.normalizeBulletPoints(normalized);

    // Remove extra spacing around punctuation
    normalized = normalized.replace(/\s+([,.;:!?])/g, '$1')  // Remove space before punctuation
                          .replace(/([,.;:!?])\s{2,}/g, '$1 '); // Normalize space after punctuation

    // Final cleanup
    normalized = normalized.replace(/^\s+|\s+$/g, '')         // Trim start/end
                          .replace(/\n\s*\n/g, '\n\n');      // Clean up empty lines

    return normalized;
  }

  /**
   * Remove page headers and footers based on common patterns
   */
  private static removePageHeadersFooters(text: string): string {
    const lines = text.split('\n');
    const cleanedLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip likely header/footer patterns
      if (this.isLikelyHeaderFooter(line)) {
        continue;
      }
      
      cleanedLines.push(lines[i]);
    }

    return cleanedLines.join('\n');
  }

  /**
   * Identify likely header/footer lines
   */
  private static isLikelyHeaderFooter(line: string): boolean {
    // Blank lines are paragraph structure, not page furniture. Dropping them here
    // collapsed whole documents (a whitespace-only PDF normalized to an empty rubric);
    // the whitespace pass already limits consecutive newlines.
    if (line.length === 0) return false;

    // Page numbers (standalone numbers)
    if (/^\d+$/.test(line) && line.length <= 3) return true;

    // Lines beginning with "Assignment"/"Project"/"Task"/"Requirements" are deliberately
    // NOT stripped. In an assignment brief those introduce the rubric the grader is
    // scored against, so removing them fed the model a truncated brief.
    const footerPatterns = [
      /^page \d+/i,
      /^\d+ of \d+$/i,
      /^\d+\/\d+$/,
      /^confidential$/i,
      /^proprietary$/i,
      /^copyright\b/i,
      /^©.*\d{4}/i
    ];

    return footerPatterns.some(pattern => pattern.test(line));
  }

  /**
   * Remove table of contents patterns
   */
  private static removeTableOfContents(text: string): string {
    // Only a standalone "Table of Contents" heading counts. The previous bare /contents/
    // pattern matched the word anywhere in prose (e.g. "returns the contents of the cart")
    // and deleted everything up to the next blank line, eating real requirements.
    const tocPatterns = [
      /^[ \t]*(?:table of )?contents[ \t]*$[\s\S]*?(?=\n\s*\n)/im,
      /^(\d+\.|\d+\)|\•|\-)\s+.+\s+\.{3,}\s*\d+$/gm,  // ToC line with dotted leaders
    ];

    let cleaned = text;
    tocPatterns.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '');
    });

    return cleaned;
  }

  /**
   * Normalize bullet points and list formatting
   */
  private static normalizeBulletPoints(text: string): string {
    let normalized = text;

    // Standardize bullet points
    normalized = normalized.replace(/^[\s]*[•·▪▫◦‣⁃]\s+/gm, '• ')      // Unicode bullets
                          .replace(/^[\s]*[\-\*\+]\s+/gm, '• ')        // ASCII bullets
                          .replace(/^[\s]*(\d+)[\.\)]\s+/gm, '$1. ');  // Numbered lists

    // Clean up nested lists
    normalized = normalized.replace(/^[\s]{2,}•/gm, '  •');            // Normalize indentation

    return normalized;
  }

  /**
   * Extract key requirements sections from the normalized text
   */
  static extractRequirementsSections(normalizedText: string): {
    requirements: string[];
    objectives: string[];
    deliverables: string[];
    criteria: string[];
  } {
    const sections = {
      requirements: [],
      objectives: [],
      deliverables: [],
      criteria: []
    };

    try {
      const lines = normalizedText.split('\n');
      let currentSection: keyof typeof sections | null = null;
      const sectionContent: Record<string, string[]> = {
        requirements: [],
        objectives: [],
        deliverables: [],
        criteria: []
      };

      for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Identify section headers
        if (this.isSectionHeader(trimmedLine, 'requirements')) {
          currentSection = 'requirements';
          continue;
        } else if (this.isSectionHeader(trimmedLine, 'objectives')) {
          currentSection = 'objectives';
          continue;
        } else if (this.isSectionHeader(trimmedLine, 'deliverables')) {
          currentSection = 'deliverables';
          continue;
        } else if (this.isSectionHeader(trimmedLine, 'criteria')) {
          currentSection = 'criteria';
          continue;
        }

        // Add content to current section
        if (currentSection && trimmedLine.length > 10) {
          sectionContent[currentSection].push(trimmedLine);
        }
      }

      // Convert collected content to structured requirements
      Object.keys(sections).forEach(key => {
        const content = sectionContent[key].join(' ').trim();
        if (content) {
          (sections as any)[key] = this.splitIntoRequirements(content);
        }
      });

    } catch (error) {
      appLogger.warn('Requirements section extraction failed:', error);
    }

    return sections;
  }

  /**
   * Check if a line is a section header
   */
  private static isSectionHeader(line: string, sectionType: string): boolean {
    const patterns: Record<string, RegExp[]> = {
      requirements: [
        /^requirements?$/i,
        /^functional requirements?$/i,
        /^technical requirements?$/i,
        /^\d+\.?\s*requirements?/i
      ],
      objectives: [
        /^objectives?$/i,
        /^learning objectives?$/i,
        /^project objectives?$/i,
        /^\d+\.?\s*objectives?/i
      ],
      deliverables: [
        /^deliverables?$/i,
        /^expected deliverables?$/i,
        /^what to deliver$/i,
        /^\d+\.?\s*deliverables?/i
      ],
      criteria: [
        /^criteria$/i,
        /^evaluation criteria$/i,
        /^assessment criteria$/i,
        /^grading criteria$/i,
        /^\d+\.?\s*criteria/i
      ]
    };

    return patterns[sectionType]?.some(pattern => pattern.test(line)) || false;
  }

  /**
   * Split content into individual requirements
   */
  private static splitIntoRequirements(content: string): string[] {
    const requirements: string[] = [];
    
    // Split by bullet points or numbered items
    const items = content.split(/(?:^|\n)\s*(?:•|\d+\.|\-)\s+/);
    
    for (const item of items) {
      const cleanItem = item.trim();
      if (cleanItem.length > 20) {  // Ignore very short items
        requirements.push(cleanItem);
      }
    }

    // If no structured items found, split by sentences or paragraphs
    if (requirements.length === 0) {
      const sentences = content.split(/[.!?]+\s+/);
      for (const sentence of sentences) {
        const cleanSentence = sentence.trim();
        if (cleanSentence.length > 20) {
          requirements.push(cleanSentence);
        }
      }
    }

    return requirements;
  }
}
