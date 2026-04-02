import { PdfProcessor, type PdfExtractionResult } from '../../../common/utils/pdfProcessor.js';
import { ProjectAnalyzer, type ProjectAnalysisResult } from '../../../common/utils/projectAnalyzer.js';
import type { ZipScanResult, SourceFile } from '../../../common/utils/zipProcessor.js';
import { selectRelevantSourceFiles, MAX_ANALYSIS_SOURCE_FILES } from '../../../common/utils/sourceFileSelection.js';
import type { IMetadata } from '../models/assignmentFeedback.model.js';
import { appLogger } from '../../../common/services/logger.js';

export interface AssignmentAnalysisResult {
  success: boolean;
  metadata: IMetadata;
  sourceCodeSummary: string;
  errors: string[];
  processingTime: number;
}

function stringifyRequirementSections(sections: {
  requirements: string[];
  objectives: string[];
  deliverables: string[];
  criteria: string[];
}): string {
  const chunks: string[] = [];

  const appendSection = (title: string, items: string[]) => {
    if (items.length === 0) {
      return;
    }

    chunks.push(`${title}:`);
    for (const item of items.slice(0, 12)) {
      chunks.push(`- ${item}`);
    }
    chunks.push('');
  };

  appendSection('Requirements', sections.requirements);
  appendSection('Objectives', sections.objectives);
  appendSection('Deliverables', sections.deliverables);
  appendSection('Criteria', sections.criteria);

  return chunks.join('\n').trim();
}

export interface AnalysisInput {
  zipScanResult?: ZipScanResult;
  pdfBuffer?: Buffer;
  requirementsText?: string; // Pre-extracted requirements
}

export class AssignmentAnalysisService {
  /**
   * Perform comprehensive analysis of an assignment submission
   */
  static async analyzeAssignment(input: AnalysisInput): Promise<AssignmentAnalysisResult> {
    const startTime = Date.now();
    const result: AssignmentAnalysisResult = {
      success: false,
      metadata: {},
      sourceCodeSummary: '',
      errors: [],
      processingTime: 0
    };

    try {
      appLogger.info('Starting assignment analysis', {
        hasZipScan: !!input.zipScanResult,
        hasPdfBuffer: !!input.pdfBuffer,
        hasRequirements: !!input.requirementsText
      });

      // Step 1: Extract requirements from PDF if provided
      let requirementsText = input.requirementsText || '';
      if (input.pdfBuffer && !requirementsText) {
        const pdfResult = await this.processPdfRequirements(input.pdfBuffer);
        if (pdfResult.success) {
          requirementsText = pdfResult.extractedText;
          const structuredRequirements = PdfProcessor.extractRequirementsSections(pdfResult.normalizedText);
          result.metadata.extractedRequirements = stringifyRequirementSections(structuredRequirements) || pdfResult.normalizedText;
        } else {
          result.errors.push(...pdfResult.errors);
        }
      } else if (requirementsText) {
        result.metadata.extractedRequirements = requirementsText;
      }

      // Step 2: Analyze project structure if ZIP scan provided
      if (input.zipScanResult?.isValid) {
        const projectAnalysis = this.analyzeProjectStructure(input.zipScanResult);
        this.populateMetadataFromProjectAnalysis(result.metadata, projectAnalysis);
        
        // Generate source code summary
        result.sourceCodeSummary = this.generateSourceCodeSummary(input.zipScanResult.sourceFiles);
        result.metadata.sourceCodeSummary = result.sourceCodeSummary;
      } else {
        result.errors.push('No valid ZIP scan results provided for project analysis');
      }

      result.success = result.errors.length === 0 || (result.errors.length > 0 && !!result.metadata.detectedLanguage);
      result.processingTime = Date.now() - startTime;

      appLogger.info('Assignment analysis completed', {
        success: result.success,
        errorsCount: result.errors.length,
        processingTime: result.processingTime,
        detectedLanguage: result.metadata.detectedLanguage,
        projectScope: result.metadata.projectScope
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown analysis error';
      result.errors.push(`Analysis failed: ${message}`);
      result.processingTime = Date.now() - startTime;
      
      appLogger.error('Assignment analysis failed:', error);
    }

    return result;
  }

  /**
   * Process PDF requirements document
   */
  private static async processPdfRequirements(pdfBuffer: Buffer): Promise<PdfExtractionResult> {
    try {
      return await PdfProcessor.extractTextFromPdf(pdfBuffer);
    } catch (error) {
      appLogger.error('PDF processing failed:', error);
      return {
        success: false,
        extractedText: '',
        normalizedText: '',
        metadata: {
          totalPages: 0,
          originalLength: 0,
          normalizedLength: 0,
          hasImages: false
        },
        errors: [error instanceof Error ? error.message : 'PDF processing failed']
      };
    }
  }

  /**
   * Analyze project structure from ZIP scan results
   */
  private static analyzeProjectStructure(zipScanResult: ZipScanResult): ProjectAnalysisResult {
    return ProjectAnalyzer.analyzeProject(zipScanResult);
  }

  /**
   * Populate metadata object with project analysis results
   */
  private static populateMetadataFromProjectAnalysis(
    metadata: IMetadata, 
    analysis: ProjectAnalysisResult
  ): void {
    // Set basic metadata
    metadata.detectedLanguage = analysis.primaryLanguage || undefined;
    metadata.projectScope = analysis.projectScope;
    metadata.fileCount = analysis.complexity.fileCount;

    // Set detailed scan metadata
    metadata.scanMetadata = {
      frameworks: analysis.frameworks.map(f => f.name),
      buildSystem: analysis.buildSystem || undefined,
      hasTests: analysis.hasTests,
      hasDocumentation: analysis.hasDocumentation,
      qualityScore: analysis.qualityScore,
      complexity: {
        linesOfCode: analysis.complexity.linesOfCode,
        cyclomaticComplexity: analysis.complexity.cyclomaticComplexity,
        testCoverage: analysis.complexity.testCoverage
      },
      projectType: analysis.projectType,
      recommendations: analysis.recommendations
    };
  }

  /**
   * Generate a consolidated source code summary
   */
  private static generateSourceCodeSummary(sourceFiles: SourceFile[]): string {
    const summary: string[] = [];
    const maxFileSize = 2000; // Limit individual file content in summary
    const maxTotalSize = 50000; // Limit total summary size
    
    let currentSize = 0;
    const sortedFiles = selectRelevantSourceFiles(sourceFiles, MAX_ANALYSIS_SOURCE_FILES);
    const omittedFiles = Math.max(0, sourceFiles.length - sortedFiles.length);

    for (const file of sortedFiles) {
      if (currentSize >= maxTotalSize) {
        summary.push(`\n... [additional content omitted] ...`);
        break;
      }

      const fileHeader = `\n=== ${file.path} (${file.language}) ===\n`;
      let fileContent = file.content;
      
      // Truncate large files
      if (fileContent.length > maxFileSize) {
        fileContent = fileContent.substring(0, maxFileSize) + '\n... [content truncated] ...';
      }
      
      const fileEntry = fileHeader + fileContent + '\n';
      
      if (currentSize + fileEntry.length > maxTotalSize) {
        summary.push(`\n... [remaining content truncated] ...`);
        break;
      }
      
      summary.push(fileEntry);
      currentSize += fileEntry.length;
    }

    if (omittedFiles > 0 && currentSize < maxTotalSize) {
      summary.push(`\n... [${omittedFiles} additional files omitted; limited to the ${MAX_ANALYSIS_SOURCE_FILES} most relevant files] ...`);
    }

    return summary.join('').trim();
  }

  /**
   * Quick validation method for analysis inputs
   */
  static validateAnalysisInput(input: AnalysisInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!input.zipScanResult && !input.pdfBuffer && !input.requirementsText) {
      errors.push('At least one input type (ZIP scan, PDF buffer, or requirements text) must be provided');
    }

    if (input.zipScanResult && !input.zipScanResult.isValid) {
      errors.push('Provided ZIP scan result is invalid');
    }

    if (input.pdfBuffer && input.pdfBuffer.length === 0) {
      errors.push('PDF buffer is empty');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
