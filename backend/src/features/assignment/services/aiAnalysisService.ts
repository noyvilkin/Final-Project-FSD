import { GeminiClient, GeminiPayload } from "../../../common/services/geminiClient.js";
import { AssignmentFeedback } from "../models/assignmentFeedback.model.js";
import { appLogger } from "../../../common/services/logger.js";
import type { AssignmentMetadata } from "../../resume/types/professionalDNA.types.js"
import { normalizeAnalysisFailure } from "./assignmentRecovery.js";
import { MAX_ANALYSIS_SOURCE_FILES, selectRelevantSourceCodeEntries } from '../../../common/utils/sourceFileSelection.js';

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
  private static readonly MAX_SOURCE_FILE_CHARS = 1200;
  private static readonly MAX_SOURCE_CODE_CHARS = 16000;

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
      
      // Prepare Gemini payload
      const geminiPayload: GeminiPayload = {
        system_instruction: {
          parts: [{
            text: `You are a professional engineering reviewer evaluating a take-home assignment for hiring.
                   Be fair, specific, and evidence-based.
                   Prioritize requirement completion and correctness over style preferences.
                   Use "areas for improvement" for polish opportunities, not as automatic major score penalties.
                   Penalize only clear requirement gaps, broken behavior, or major deviations from the task.
                   Always respond with valid JSON only, no markdown code blocks or extra text.`
          }]
        },
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: this.buildAnalysisResponseSchema(),
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

  /**
   * Consolidates source code from metadata into a single string
   */
  private static consolidateSourceCode(metadata: AssignmentMetadata): string {
    if (!metadata.sourceCodeContent) {
      return 'No source code found';
    }

    const consolidatedFiles: string[] = [];
    const selectedFiles = selectRelevantSourceCodeEntries(metadata.sourceCodeContent, MAX_ANALYSIS_SOURCE_FILES);
    const omittedFiles = Math.max(0, Object.keys(metadata.sourceCodeContent).length - selectedFiles.length);
    let totalSize = 0;

    if (omittedFiles > 0) {
      consolidatedFiles.push(
        `\n... [analysis limited to the ${selectedFiles.length} most relevant files; ${omittedFiles} other files omitted] ...\n`
      );
    }

    for (const { path: filePath, content } of selectedFiles) {
      if (totalSize >= this.MAX_SOURCE_CODE_CHARS) {
        consolidatedFiles.push(`\n... [source code truncated to keep the prompt focused] ...\n`);
        break;
      }

      const truncatedContent = content.length > this.MAX_SOURCE_FILE_CHARS
        ? `${content.slice(0, this.MAX_SOURCE_FILE_CHARS)}\n... [content truncated] ...`
        : content;

      const fileEntry = `\n=== File: ${filePath} ===\n${truncatedContent}\n`;

      if (totalSize + fileEntry.length > this.MAX_SOURCE_CODE_CHARS) {
        consolidatedFiles.push(`\n... [source code truncated to keep the prompt focused] ...\n`);
        break;
      }

      consolidatedFiles.push(fileEntry);
      totalSize += fileEntry.length;
    }

    return consolidatedFiles.join('\n');
  }

  private static buildAnalysisResponseSchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        codeQuality: {
          type: 'object',
          properties: {
            score: { type: 'number' },
            strengths: { type: 'array', items: { type: 'string' } },
            weaknesses: { type: 'array', items: { type: 'string' } },
          },
          required: ['score', 'strengths', 'weaknesses'],
        },
        functionalCorrectness: {
          type: 'object',
          properties: {
            score: { type: 'number' },
            meetsRequirements: { type: 'boolean' },
            missingFeatures: { type: 'array', items: { type: 'string' } },
          },
          required: ['score', 'meetsRequirements', 'missingFeatures'],
        },
        bestPractices: {
          type: 'object',
          properties: {
            score: { type: 'number' },
            followsConventions: { type: 'boolean' },
            suggestions: { type: 'array', items: { type: 'string' } },
          },
          required: ['score', 'followsConventions', 'suggestions'],
        },
        overall: {
          type: 'object',
          properties: {
            score: { type: 'number' },
            grade: { type: 'string' },
            summary: { type: 'string' },
          },
          required: ['score', 'grade', 'summary'],
        },
      },
      required: ['codeQuality', 'functionalCorrectness', 'bestPractices', 'overall'],
    };
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
    
    prompt += `Focus on code quality, best practices, and functional correctness.
  Be fair and calibrated: strong, working infrastructure should not be scored as failing just because it is incomplete.
  Use the provided requirements as guidance, but avoid harsh deductions for minor omissions unless they materially affect the solution.`;
    
    return prompt;
  }

  /**
   * Builds the complete analysis prompt for Gemini with strict grading criteria
   */
  private static buildAnalysisPrompt(payload: UnifiedAnalysisPayload): string {
    return `
You are a professional reviewer evaluating a real hiring assignment.
Focus on whether the candidate completed the requested requirements and delivered a working solution.
Use improvements as constructive feedback, not automatic failure criteria.

**SCORING APPROACH (0-100):**
- Primary factor: requirement completion and functional correctness.
- Secondary factor: code quality and best practices.
- Keep scores calibrated for hiring context (not classroom strictness).

**CALIBRATION GUIDE:**
- 85-100: Strong submission. Requirements largely completed, solution works, only minor issues.
- 70-84: Solid submission. Core requirements mostly completed, some gaps or trade-offs.
- 55-69: Partial submission. Important requirements missing or functionality is unreliable.
- 0-54: Major deficiencies. Core requirements largely unmet or key functionality is broken.

**IMPORTANT REVIEW RULES:**
- Anchor feedback to the stated requirements and concrete evidence from code.
- Do not invent missing requirements that are not in the assignment text.
- Do not assign failing grades for minor polish issues when core requirements are met.
- Put non-blocking concerns in best-practices suggestions.

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

Ensure scores and summary reflect requirement completion first, then quality and maintainability.
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
          grade: parsed.overall?.grade == null ? 'F' : String(parsed.overall.grade),
          summary: parsed.overall?.summary == null ? 'No summary provided' : String(parsed.overall.summary)
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
      const now = new Date();
      const normalizedFailure = analysisResult.success
        ? null
        : normalizeAnalysisFailure(analysisResult.error || 'AI analysis failed');

      const updateData: any = {
        $set: {
          status: analysisResult.success ? 'completed' : 'failed',
          aiAnalysisCompletedAt: now,
        },
        $unset: {
          jobId: 1,
          'recovery.activeRunId': 1,
          'recovery.activeRunType': 1,
          'recovery.activeRunStartedAt': 1,
        },
      };

      if (analysisResult.success && analysisResult.feedback) {
        updateData.$set.aiFeedback = analysisResult.feedback;
      }

      if (analysisResult.error) {
        const errors = [analysisResult.error];
        if (rawAIResponse) {
          errors.push(`Raw AI Response (first 1000 chars): ${rawAIResponse.substring(0, 1000)}`);
        }
        updateData.$set.processingErrors = errors;
        updateData.$set['recovery.failureReason'] = normalizedFailure?.reason || analysisResult.error;
        updateData.$set['recovery.failureCategory'] = normalizedFailure?.category || 'unknown';
        updateData.$set['recovery.lastFailureAt'] = now;
      } else {
        updateData.$unset.processingErrors = 1;
        updateData.$unset['recovery.failureReason'] = 1;
        updateData.$unset['recovery.failureCategory'] = 1;
        updateData.$unset['recovery.lastFailureAt'] = 1;
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
