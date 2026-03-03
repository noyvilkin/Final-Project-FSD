import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
import { appLogger } from '../services/logger.js';

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
      const data = await pdfParse(pdfBuffer);
      
      result.extractedText = data.text;
      result.metadata.totalPages = data.numpages;
      result.metadata.originalLength = data.text.length;
      
      if (data.text.length === 0) {
        result.errors.push('No text content found in PDF');
        return result;
      }

      // Normalize the extracted text
      result.normalizedText = this.normalizeText(data.text);
      result.metadata.normalizedLength = result.normalizedText.length;
      
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
    // Empty or very short lines
    if (line.length <= 2) return true;
    
    // Page numbers (standalone numbers)
    if (/^\d+$/.test(line) && line.length <= 3) return true;
    
    // Common footer patterns
    const footerPatterns = [
      /^page \d+/i,
      /^\d+ of \d+$/i,
      /^\d+\/\d+$/,
      /^confidential/i,
      /^proprietary/i,
      /^copyright/i,
      /^©.*\d{4}/i,
      /^.*\d{4}.*copyright/i
    ];
    
    if (footerPatterns.some(pattern => pattern.test(line))) {
      return true;
    }

    // Headers (commonly at start of pages)
    const headerPatterns = [
      /^assignment/i,
      /^project/i,
      /^exercise/i,
      /^task/i,
      /^requirements/i
    ];
    
    // Only consider as header if it's very short and matches pattern
    if (line.length <= 50 && headerPatterns.some(pattern => pattern.test(line))) {
      return true;
    }

    return false;
  }

  /**
   * Remove table of contents patterns
   */
  private static removeTableOfContents(text: string): string {
    // Look for table of contents patterns and remove them
    const tocPatterns = [
      /table of contents[\s\S]*?(?=\n\n|\n[A-Z])/i,
      /contents[\s\S]*?(?=\n\n|\n[A-Z])/i,
      /^(\d+\.|\d+\)|\•|\-)\s+.+\s+\.\.\.\s+\d+$/gm,  // ToC line with dots and page numbers
      /^(\d+\.|\d+\))\s+[A-Z][^.]+\s+\d+$/gm          // Simple numbered ToC lines
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
