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
            text: `You are an expert programming instructor providing detailed assignment feedback. 
                   Analyze student code and provide constructive, actionable feedback in JSON format.
                   Be encouraging but honest about areas for improvement.`
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
      
      // Parse the response
      const feedback = this.parseAIResponse(rawResponse);
      
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
   * Builds the complete analysis prompt for Gemini
   */
  private static buildAnalysisPrompt(payload: UnifiedAnalysisPayload): string {
    return `
Please analyze the following programming assignment and provide detailed feedback in JSON format.

**Assignment Requirements:**
${payload.requirements}

**Student's Source Code:**
${payload.sourceCode}

**Analysis Context:**
- Programming Language: ${payload.metadata.detectedLanguage || 'Unknown'}
- Detected Frameworks: ${payload.metadata.detectedFrameworks?.join(', ') || 'None'}
- Total Files: ${payload.metadata.totalFiles || 0}
- Total Lines: ${payload.metadata.totalLines || 0}

**Required JSON Response Format:**
{
  "codeQuality": {
    "score": 85,
    "strengths": ["Good variable naming", "Clean function structure"],
    "weaknesses": ["Missing error handling", "No input validation"]
  },
  "functionalCorrectness": {
    "score": 78,
    "meetsRequirements": true,
    "missingFeatures": ["Edge case handling", "Input validation"]
  },
  "bestPractices": {
    "score": 82,
    "followsConventions": true,
    "suggestions": ["Add comments for complex logic", "Use constants for magic numbers"]
  },
  "overall": {
    "score": 82,
    "grade": "B",
    "summary": "Good implementation with room for improvement in error handling and edge cases."
  }
}

Please provide specific, actionable feedback that will help the student improve their coding skills.
    `.trim();
  }

  /**
   * Parses the AI response into structured feedback
   */
  private static parseAIResponse(rawResponse: string): AIAnalysisResult['feedback'] {
    try {
      // Extract JSON from the response (in case there's extra text)
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      const jsonText = jsonMatch ? jsonMatch[0] : rawResponse;
      
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
  static async saveAnalysisResults(assignmentId: string, analysisResult: AIAnalysisResult): Promise<void> {
    try {
      const updateData: any = {
        status: analysisResult.success ? 'completed' : 'failed',
        aiAnalysisCompletedAt: new Date()
      };

      if (analysisResult.success && analysisResult.feedback) {
        updateData.aiFeedback = analysisResult.feedback;
      }

      if (analysisResult.error) {
        updateData.processingErrors = [analysisResult.error];
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
