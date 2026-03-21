import { GeminiClient } from '../../../common/services/geminiClient.js';
import { appLogger } from '../../../common/services/logger.js';
import { ProfessionalDNA } from '../models/professionalDNA.model.js';
import { OptimizationPromptBuilder } from '../prompts/optimizationPrompts.js';
import { GeminiResponseAdapter } from '../adapters/geminiAdapter.js';
import { ScoringService } from './scoringService.js';
import type {
  OptimizationPayload,
  BulletToOptimize,
  GeminiOptimizationResponse,
  OptimizeRequest,
  OptimizeResponse,
  AcceptBulletRequest,
} from '../types/optimization.types.js';

export class ResumeOptimizationService {
  private static geminiClient: GeminiClient | null = null;
  private static promptBuilder = new OptimizationPromptBuilder('v1');

  private static getGeminiClient(): GeminiClient {
    if (!this.geminiClient) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY environment variable is required');
      }

      this.geminiClient = new GeminiClient({
        apiKey,
        model: 'gemini-2.5-flash',
        temperature: 0.4,
        maxOutputTokens: 4096,
        rateLimiter: {
          requestsPerMinute: 8,
          requestsPerDay: 1200,
        },
      });
    }
    return this.geminiClient;
  }

  static async optimizeResume(request: OptimizeRequest): Promise<OptimizeResponse> {
    appLogger.info('[ResumeOptimizationService] Starting optimization', {
      dnaId: request.professionalDNAId,
    });

    const dna = await ProfessionalDNA.findById(request.professionalDNAId);
    if (!dna) {
      throw new Error(`ProfessionalDNA ${request.professionalDNAId} not found`);
    }

    const bulletsToOptimize = this.extractBullets(dna, request.selectedBulletIndices);
    if (bulletsToOptimize.length === 0) {
      throw new Error('No bullet points found to optimize');
    }

    const payload: OptimizationPayload = {
      professionalDNAId: request.professionalDNAId,
      jobDescription: request.jobDescription,
      bulletsToOptimize,
      skills: dna.skills,
      experience: dna.experience,
    };

    const geminiPayload = this.promptBuilder.buildOptimizationPayload(payload);

    const client = this.getGeminiClient();
    const rawResponse = await client.generate(geminiPayload);

    appLogger.info('[ResumeOptimizationService] Gemini response received', {
      dnaId: request.professionalDNAId,
      responseLength: rawResponse.length,
    });

    const parsedResponse = this.parseGeminiResponse(rawResponse);
    const uiBullets = GeminiResponseAdapter.toUIState(parsedResponse, bulletsToOptimize);

    const hybridScore = await ScoringService.calculateHybridScore(
      dna,
      request.jobDescription,
      this.getGeminiClient(),
      this.promptBuilder,
    );

    return { bullets: uiBullets, hybridScore };
  }

  static async acceptBullet(request: AcceptBulletRequest): Promise<void> {
    const dna = await ProfessionalDNA.findById(request.professionalDNAId);
    if (!dna) {
      throw new Error(`ProfessionalDNA ${request.professionalDNAId} not found`);
    }

    const exp = dna.experience[request.experienceIndex];
    if (!exp) {
      throw new Error(`Experience at index ${request.experienceIndex} not found`);
    }

    exp.description = request.finalBullet;
    await dna.save();

    appLogger.info('[ResumeOptimizationService] Bullet accepted and saved', {
      dnaId: request.professionalDNAId,
      experienceIndex: request.experienceIndex,
    });
  }

  private static extractBullets(
    dna: InstanceType<typeof ProfessionalDNA>,
    selectedIndices?: number[],
  ): BulletToOptimize[] {
    const bullets: BulletToOptimize[] = [];

    dna.experience.forEach((exp, index) => {
      if (selectedIndices && !selectedIndices.includes(index)) return;
      if (!exp.description) return;

      bullets.push({
        experienceIndex: index,
        originalBullet: exp.description,
        role: exp.role,
        company: exp.company,
      });
    });

    return bullets;
  }

  private static parseGeminiResponse(raw: string): GeminiOptimizationResponse {
    try {
      let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      const jsonText = jsonMatch ? jsonMatch[0] : cleaned;

      const parsed = JSON.parse(jsonText);

      return {
        optimizedBullets: Array.isArray(parsed.optimizedBullets)
          ? parsed.optimizedBullets.map((b: Record<string, unknown>) => ({
              experienceIndex: Number(b.experienceIndex) || 0,
              originalBullet: String(b.originalBullet || ''),
              optimizedBullet: String(b.optimizedBullet || ''),
              explanation: String(b.explanation || ''),
              confidenceScore: Math.min(1, Math.max(0, Number(b.confidenceScore) || 0)),
              keywordsUsed: Array.isArray(b.keywordsUsed) ? b.keywordsUsed.map(String) : [],
            }))
          : [],
        overallNotes: String(parsed.overallNotes || ''),
      };
    } catch (error) {
      appLogger.error('[ResumeOptimizationService] Failed to parse Gemini response', {
        error: error instanceof Error ? error.message : 'Unknown error',
        rawPreview: raw.substring(0, 500),
      });
      throw new Error('Failed to parse AI optimization response');
    }
  }
}
