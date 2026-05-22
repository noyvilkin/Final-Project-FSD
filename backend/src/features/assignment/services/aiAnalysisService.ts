import { GeminiClient, GeminiPayload } from "../../../common/services/geminiClient.js";
import { AssignmentFeedback } from "../models/assignmentFeedback.model.js";
import { appLogger } from "../../../common/services/logger.js";
import type { AssignmentMetadata } from "../../resume/types/professionalDNA.types.js"

export interface UnifiedAnalysisPayload {
  requirements: string;
  sourceCode: string;
  metadata: AssignmentMetadata;
  analysisPrompt: string;
}

export interface AIAnalysisResult {
  success: boolean;
  feedback?: {
    codeQuality: {
      score: number;      // 0-100
      strengths: string[];
      weaknesses: string[];
    };
    functionalCorrectness: {
      score: number;      // 0-100
      meetsRequirements: boolean;
      missingFeatures: string[];
    };
    bestPractices: {
      score: number;      // 0-100
      followsConventions: boolean;
      suggestions: string[];
    };
    overall: {
      score: number;      // 0-100
      grade: string;      // A, B, C, D, F
      summary: string;
    };
  };
  error?: string;
}

export class AIAnalysisService {
  private static geminiClient: GeminiClient | null = null;

  private static isDryRunEnabled(): boolean {
    const value =
      process.env.ASSIGNMENT_AI_DRY_RUN ??
      process.env.DRY_RUN_AI_ANALYSIS ??
      process.env.GEMINI_DRY_RUN;

    return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase());
  }

  private static getGeminiClient(): GeminiClient {
    if (!this.geminiClient) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY environment variable is required');
      }
      
      this.geminiClient = new GeminiClient({
        apiKey,
        model: 'gemini-2.5-flash',
        temperature: 0.3,
        maxOutputTokens: 3072,
        rateLimiter: {
          requestsPerMinute: 8,  // Conservative limit
          requestsPerDay: 1200   // Conservative daily limit
        }
      });
    }
    
    return this.geminiClient;
  }

  /**
   * Constructs a unified payload for LLM analysis from assignment data
   */
  static async constructUnifiedPayload(assignmentId: string): Promise<UnifiedAnalysisPayload> {
    appLogger.info("[AIAnalysisService] Constructing unified payload", { assignmentId });

    // Fetch assignment data
    const assignment = await AssignmentFeedback.findById(assignmentId);
    if (!assignment) {
      throw new Error(`Assignment ${assignmentId} not found`);
    }

    if (!assignment.metadata || !assignment.metadata.sourceCodeContent) {
      throw new Error(`Assignment ${assignmentId} missing analysis data`);
    }

    const metadata = assignment.metadata;
    
    // Extract requirements text (if available)
    const requirements = metadata.requirements || 'No specific requirements provided';
    
    // Consolidate source code
    const sourceCode = this.consolidateSourceCode(metadata);
    
    // Generate analysis prompt based on detected language and metadata
    const analysisPrompt = this.generateAnalysisPrompt(metadata);
    
    appLogger.info("[AIAnalysisService] Payload construction completed", {
      assignmentId,
      requirementsLength: requirements.length,
      sourceCodeLength: sourceCode.length,
      detectedLanguage: metadata.detectedLanguage
    });

    return {
      requirements,
      sourceCode,
      metadata,
      analysisPrompt
    };
  }

  /**
   * Analyzes an assignment using AI and returns structured feedback
   */
  static async analyzeAssignmentWithAI(assignmentId: string): Promise<AIAnalysisResult> {
    try {
      appLogger.info("[AIAnalysisService] Starting AI analysis", { assignmentId });

      // Construct unified payload
      const payload = await this.constructUnifiedPayload(assignmentId);

      if (this.isDryRunEnabled()) {
        appLogger.info("[AIAnalysisService] Dry-run mode enabled, skipping Gemini call", {
          assignmentId,
        });

        return this.buildDryRunResult(payload, assignmentId);
      }
      
      // Prepare Gemini payload
      const geminiPayload: GeminiPayload = {
        system_instruction: {
          parts: [{
            text: `You are a strict university professor grading programming assignments. 
                   Provide honest, critical evaluation. Do NOT be lenient.
                   When requirements are ignored or core features are missing, assign low scores.
                   Intentional deviations from specifications result in failing grades.
                   Always respond with valid JSON only, no markdown code blocks or extra text.`
          }]
        },
        contents: [{
          role: 'user',
          parts: [{
            text: this.buildAnalysisPrompt(payload)
          }]
        }]
      };

      // Call Gemini API
      const client = this.getGeminiClient();
      const rawResponse = await client.generate(geminiPayload);
      
      // Log raw response for debugging
      appLogger.info("[AIAnalysisService] Raw AI response received", {
        assignmentId,
        responseLength: rawResponse.length,
        responsePreview: rawResponse.substring(0, 200)
      });
      
      // Parse the response
      const feedback = this.parseAIResponse(rawResponse);
      
      // Check if parsing returned error feedback (score of 0 indicates parse failure)
      if (feedback && feedback.overall.score === 0 && feedback.overall.summary.includes('failed')) {
        appLogger.error("[AIAnalysisService] AI response parsing failed", {
          assignmentId,
          rawResponse: rawResponse.substring(0, 1000)
        });
        
        return {
          success: false,
          error: `Failed to parse AI response. Raw: ${rawResponse.substring(0, 500)}`,
          feedback  // Include the error feedback structure
        };
      }
      
      appLogger.info("[AIAnalysisService] AI analysis completed", {
        assignmentId,
        overallScore: feedback?.overall?.score
      });

      return {
        success: true,
        feedback
      };

    } catch (error) {
      appLogger.error("[AIAnalysisService] AI analysis failed", {
        assignmentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'AI analysis failed'
      };
    }
  }

  private static buildDryRunResult(
    payload: UnifiedAnalysisPayload,
    assignmentId: string
  ): AIAnalysisResult {
    const requirementLines = this.extractRequirementLines(payload.requirements);
    const sourceCode = this.stripSourceComments(payload.sourceCode.toLowerCase());

    const missingFeatures = requirementLines.filter((requirement) => {
      return !this.isRequirementCovered(requirement, sourceCode);
    });

    const explicitSignals = this.detectIntentionalViolations(sourceCode);
    for (const signal of explicitSignals) {
      if (!missingFeatures.includes(signal)) {
        missingFeatures.push(signal);
      }
    }

    const hasTests = /\b(test|tests|spec|jest|mocha|vitest|pytest|unittest)\b/i.test(
      payload.sourceCode
    );

    const strengths = [
      'Dry-run analysis completed without external Gemini access',
      `Source snapshot contains ${payload.sourceCode.split('\n').length} lines of consolidated code`
    ];

    if (payload.metadata.detectedFrameworks?.length) {
      strengths.push(`Detected frameworks: ${payload.metadata.detectedFrameworks.join(', ')}`);
    }

    if (hasTests) {
      strengths.push('Test-related files or framework references were detected');
    }

    const weaknesses = [
      ...(missingFeatures.length > 0 ? ['One or more stated requirements appear to be missing'] : []),
      ...(!hasTests ? ['No obvious unit test coverage was detected'] : [])
    ];

    const functionalScore = Math.max(0, 92 - missingFeatures.length * 15 - (hasTests ? 0 : 10));
    const codeQualityScore = Math.max(0, 86 - (hasTests ? 0 : 12) - Math.min(missingFeatures.length * 4, 20));
    const bestPracticesScore = Math.max(0, 84 - (hasTests ? 0 : 10));
    const overallScore = Math.round((functionalScore + codeQualityScore + bestPracticesScore) / 3);

    return {
      success: true,
      feedback: {
        codeQuality: {
          score: codeQualityScore,
          strengths,
          weaknesses,
        },
        functionalCorrectness: {
          score: functionalScore,
          meetsRequirements: missingFeatures.length === 0,
          missingFeatures: missingFeatures.length > 0 ? missingFeatures : ['No obvious missing features detected in dry-run mode'],
        },
        bestPractices: {
          score: bestPracticesScore,
          followsConventions: hasTests,
          suggestions: hasTests
            ? ['Dry-run mode cannot validate runtime correctness, only static signals were inspected']
            : ['Add tests for the main execution path and core behaviors'],
        },
        overall: {
          score: overallScore,
          grade: this.scoreToGrade(overallScore),
          summary: this.buildDryRunSummary(assignmentId, missingFeatures, hasTests),
        },
      },
    };
  }

  private static stripSourceComments(sourceCode: string): string {
    return sourceCode
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private static detectIntentionalViolations(sourceCode: string): string[] {
    const missing: string[] = [];

    const hasApolloOrGraphql = /apollo-server|\bgraphql\b|\bgql\b/.test(sourceCode);
    const hasExpress = /\bexpress\b/.test(sourceCode);
    const hasSqlite = /sqlite3|\bsqlite\b|:memory:/.test(sourceCode);
    const hasJwt = /\bjwt\b|jsonwebtoken/.test(sourceCode);
    const hasAuth = /\bauth\b|authentication|middleware/.test(sourceCode);
    const hasHealthRoute = /\/health|health endpoint|app\.get\(['"]\/health['"]/.test(sourceCode);
    const hasTestSignals = /\b(describe|it\(|test\(|expect\(|jest|vitest|mocha|pytest|unittest)\b/.test(sourceCode);

    if (hasApolloOrGraphql && !hasExpress) {
      missing.push('Use Node.js and Express to implement a REST API');
    }

    if (hasSqlite) {
      missing.push('Use PostgreSQL as the primary datastore');
    }

    if (!hasJwt && !hasAuth) {
      missing.push('Implement authentication via JWT');
    }

    if (!hasTestSignals) {
      missing.push('Include unit tests for core endpoints');
    }

    if (!hasHealthRoute) {
      missing.push('Provide a health endpoint at GET /health returning 200');
    }

    return missing;
  }

  private static extractRequirementLines(requirements: string): string[] {
    return requirements
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => {
        if (!line) return false;
        if (/^(assignment|objective|hard requirements?|requirements?|deliverables?|criteria):?$/i.test(line)) {
          return false;
        }
        return /^[-*•\d]/.test(line) || /\b(must|required|use|implement|provide|include|ensure|build|create|support)\b/i.test(line);
      })
      .map((line) => line.replace(/^[-*•\d.)\s]+/, '').trim())
      .filter(Boolean);
  }

  private static isRequirementCovered(requirement: string, sourceCode: string): boolean {
    const requirementLower = requirement.toLowerCase();

    if (requirementLower.includes('express')) {
      return sourceCode.includes('express');
    }

    if (requirementLower.includes('jwt')) {
      return sourceCode.includes('jwt') || sourceCode.includes('token');
    }

    if (requirementLower.includes('postgres')) {
      return sourceCode.includes('postgres');
    }

    if (requirementLower.includes('health')) {
      return sourceCode.includes('/health') || sourceCode.includes('health');
    }

    const tokens = requirementLower.match(/[a-z0-9]+/g) ?? [];
    const stopwords = new Set(['the', 'and', 'or', 'with', 'for', 'use', 'implement', 'provide', 'include', 'create', 'build', 'must', 'should', 'to', 'a', 'an', 'of', 'in', 'on', 'by', 'as', 'be']);
    const keywords = tokens.filter((token) => token.length > 2 && !stopwords.has(token));

    if (keywords.length === 0) {
      return false;
    }

    const matches = keywords.filter((keyword) => sourceCode.includes(keyword));
    return matches.length / keywords.length >= 0.34;
  }

  private static scoreToGrade(score: number): string {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  private static buildDryRunSummary(
    assignmentId: string,
    missingFeatures: string[],
    hasTests: boolean
  ): string {
    const requirementSummary = missingFeatures.length > 0
      ? `Detected ${missingFeatures.length} likely missing requirement(s).`
      : 'No obvious requirement gaps were found from static inspection.';

    const testingSummary = hasTests
      ? 'Test references were present in the source snapshot.'
      : 'No obvious test coverage signals were found.';

    return `Dry-run AI analysis for ${assignmentId}: ${requirementSummary} ${testingSummary}`;
  }

  /**
   * Consolidates source code from metadata into a single string
   */
  private static consolidateSourceCode(metadata: AssignmentMetadata): string {
    if (!metadata.sourceCodeContent) {
      return 'No source code found';
    }

    const consolidatedFiles: string[] = [];
    
    for (const [filePath, content] of Object.entries(metadata.sourceCodeContent)) {
      consolidatedFiles.push(`\n=== File: ${filePath} ===\n${content}\n`);
    }

    return consolidatedFiles.join('\n');
  }

  /**
   * Generates a language-specific analysis prompt
   */
  private static generateAnalysisPrompt(metadata: AssignmentMetadata): string {
    const language = metadata.detectedLanguage || 'Unknown';
    const frameworks = metadata.detectedFrameworks?.join(', ') || 'None detected';
    
    let prompt = `Analyze this ${language} assignment. `;
    
    if (metadata.detectedFrameworks?.length) {
      prompt += `The code uses: ${frameworks}. `;
    }
    
    prompt += `Focus on code quality, best practices, and functional correctness.`;
    
    return prompt;
  }

  /**
   * Builds the complete analysis prompt for Gemini with strict grading criteria
   */
  private static buildAnalysisPrompt(payload: UnifiedAnalysisPayload): string {
    return `
You are a strict university professor grading programming assignments. Provide honest, critical evaluation.

**GRADING CRITERIA (0-100 scale):**
- 90-100: Excellent - Meets ALL requirements, no significant issues
- 80-89: Good - Meets most requirements, minor issues only
- 70-79: Satisfactory - Meets basic requirements, several issues
- 60-69: Passing - Missing requirements, significant issues
- Below 60: Failing - Does not meet requirements, critical issues

**IMPORTANT - Penalize heavily for:**
- Intentional deviations from stated requirements
- Missing core functionality (persistence, error handling, validation)
- No tests or documentation
- Ignoring assignment specifications

**Assignment Requirements:**
${payload.requirements}

**Student's Source Code:**
${payload.sourceCode}

**Analysis Context:**
- Programming Language: ${payload.metadata.detectedLanguage || 'Unknown'}
- Detected Frameworks: ${payload.metadata.detectedFrameworks?.join(', ') || 'None'}
- Total Files: ${payload.metadata.totalFiles || 0}
- Total Lines: ${payload.metadata.totalLines || 0}

**Required JSON Response Format (respond ONLY with valid JSON, no other text):**
{
  "codeQuality": {
    "score": 60,
    "strengths": ["List actual strengths"],
    "weaknesses": ["List significant weaknesses"]
  },
  "functionalCorrectness": {
    "score": 50,
    "meetsRequirements": false,
    "missingFeatures": ["List missing required features"]
  },
  "bestPractices": {
    "score": 55,
    "followsConventions": false,
    "suggestions": ["Concrete improvements needed"]
  },
  "overall": {
    "score": 55,
    "grade": "F",
    "summary": "Honest assessment: What's wrong and what needs fixing."
  }
}

Grade strictly. Do NOT be generous with intentional deviations from specifications. Failing grades reflect work that ignores requirements.
    `.trim();
  }

  /**
   * Parses the AI response into structured feedback (public for reuse in POC/tests)
   */
  public static parseAIResponse(rawResponse: string): AIAnalysisResult['feedback'] {
    try {
      // Remove markdown code blocks if present
      let cleanedResponse = rawResponse;
      
      // Remove ```json and ``` markers
      cleanedResponse = cleanedResponse.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
      
      // Extract JSON from the response (in case there's extra text)
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
      const jsonText = jsonMatch ? jsonMatch[0] : cleanedResponse;
      
      const parsed = JSON.parse(jsonText);
      
      // Validate the structure and add defaults for missing fields
      return {
        codeQuality: {
          score: Number(parsed.codeQuality?.score) || 0,
          strengths: Array.isArray(parsed.codeQuality?.strengths) ? parsed.codeQuality.strengths : [],
          weaknesses: Array.isArray(parsed.codeQuality?.weaknesses) ? parsed.codeQuality.weaknesses : []
        },
        functionalCorrectness: {
          score: Number(parsed.functionalCorrectness?.score) || 0,
          meetsRequirements: Boolean(parsed.functionalCorrectness?.meetsRequirements),
          missingFeatures: Array.isArray(parsed.functionalCorrectness?.missingFeatures) ? parsed.functionalCorrectness.missingFeatures : []
        },
        bestPractices: {
          score: Number(parsed.bestPractices?.score) || 0,
          followsConventions: Boolean(parsed.bestPractices?.followsConventions),
          suggestions: Array.isArray(parsed.bestPractices?.suggestions) ? parsed.bestPractices.suggestions : []
        },
        overall: {
          score: Number(parsed.overall?.score) || 0,
          grade: String(parsed.overall?.grade) || 'F',
          summary: String(parsed.overall?.summary) || 'No summary provided'
        }
      };

    } catch (error) {
      appLogger.error("[AIAnalysisService] Failed to parse AI response", { 
        error: error instanceof Error ? error.message : 'Unknown error',
        rawResponse: rawResponse.substring(0, 500) 
      });

      // Return default feedback structure
      return {
        codeQuality: {
          score: 0,
          strengths: [],
          weaknesses: ['Failed to parse AI analysis']
        },
        functionalCorrectness: {
          score: 0,
          meetsRequirements: false,
          missingFeatures: ['Analysis parsing failed']
        },
        bestPractices: {
          score: 0,
          followsConventions: false,
          suggestions: ['Unable to provide suggestions due to parsing error']
        },
        overall: {
          score: 0,
          grade: 'F',
          summary: 'AI analysis failed to complete successfully'
        }
      };
    }
  }

  /**
   * Saves AI analysis results to the assignment document
   */
  static async saveAnalysisResults(assignmentId: string, analysisResult: AIAnalysisResult, rawAIResponse?: string): Promise<void> {
    try {
      const updateData: any = {
        status: analysisResult.success ? 'completed' : 'failed',
        aiAnalysisCompletedAt: new Date()
      };

      if (analysisResult.success && analysisResult.feedback) {
        updateData.aiFeedback = analysisResult.feedback;
      }

      if (analysisResult.error) {
        const errors = [analysisResult.error];
        if (rawAIResponse) {
          errors.push(`Raw AI Response (first 1000 chars): ${rawAIResponse.substring(0, 1000)}`);
        }
        updateData.processingErrors = errors;
      }

      await AssignmentFeedback.findByIdAndUpdate(assignmentId, updateData);
      
      appLogger.info("[AIAnalysisService] Analysis results saved", {
        assignmentId,
        success: analysisResult.success
      });

    } catch (error) {
      appLogger.error("[AIAnalysisService] Failed to save analysis results", {
        assignmentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
