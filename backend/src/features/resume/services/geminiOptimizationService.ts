import { GeminiClient } from '../../../common/services/geminiClient.js';
import type { GeminiPayload } from '../../../common/types/geminiTypes.js';
import { appLogger } from '../../../common/services/logger.js';

import {
  SYSTEM_INSTRUCTION,
  PROMPT_VERSION,
  buildOptimizationUserMessage,
} from '../prompts/optimizationPrompts.js';

import type { ResumeOptimizationPayload } from '../types/resumeOptimization.types.js';
import type {
  GeminiOptimizationResponse,
  GeminiOptimizedBullet,
  OptimizedBulletUI,
  OptimizationDashboardData,
  ConfidenceLevel,
} from '../types/aiOptimization.types.js';

import { HybridScoringService } from './hybridScoringService.js';

const MODEL_NAME = 'gemini-2.5-flash';

export class GeminiOptimizationService {
  private static geminiClient: GeminiClient | null = null;

  private static getClient(): GeminiClient {
    if (!this.geminiClient) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is required');

      this.geminiClient = new GeminiClient({
        apiKey,
        model: MODEL_NAME,
        temperature: 0.3,
        maxOutputTokens: 4096,
        rateLimiter: { requestsPerMinute: 8, requestsPerDay: 1200 },
      });
    }
    return this.geminiClient;
  }

  // ── Main orchestrator ───────────────────────────────────────────

  static async optimizeResume(
    payload: ResumeOptimizationPayload
  ): Promise<OptimizationDashboardData> {
    appLogger.info('[GeminiOptimizationService] Starting resume optimization', {
      userId: payload.professionalDNA.userId,
      bulletCount: payload.professionalDNA.experience.length,
    });

    const [geminiResponse, hybridScore] = await Promise.all([
      this.callGeminiForOptimization(payload),
      HybridScoringService.calculateHybridScore(payload),
    ]);

    const adapted = this.adaptToUI(geminiResponse, payload);

    return {
      bullets: adapted,
      generalAdvice: geminiResponse.generalAdvice,
      hybridScore,
      gapsRemaining: payload.alignment.missingSkills,
      meta: {
        generatedAt: new Date().toISOString(),
        promptVersion: PROMPT_VERSION,
        modelUsed: MODEL_NAME,
      },
    };
  }

  // ── Gemini call ─────────────────────────────────────────────────

  private static async callGeminiForOptimization(
    payload: ResumeOptimizationPayload
  ): Promise<GeminiOptimizationResponse> {
    const userMessage = buildOptimizationUserMessage(payload);

    const geminiPayload: GeminiPayload = {
      system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    };

    const client = this.getClient();
    const rawResponse = await client.generate(geminiPayload);

    appLogger.info('[GeminiOptimizationService] Gemini response received', {
      responseLength: rawResponse.length,
    });

    return this.parseOptimizationResponse(rawResponse);
  }

  // ── Response parsing ────────────────────────────────────────────

  private static parseOptimizationResponse(raw: string): GeminiOptimizationResponse {
    try {
      const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      const jsonText = jsonMatch ? jsonMatch[0] : cleaned;
      const parsed = JSON.parse(jsonText);

      if (!Array.isArray(parsed.optimizedBullets)) {
        throw new Error('Missing optimizedBullets array in response');
      }

      return {
        optimizedBullets: parsed.optimizedBullets.map(this.validateBullet),
        generalAdvice: String(parsed.generalAdvice ?? ''),
      };
    } catch (err) {
      appLogger.error('[GeminiOptimizationService] Failed to parse Gemini response', {
        error: err instanceof Error ? err.message : 'Unknown',
        rawPreview: raw.substring(0, 500),
      });
      throw new Error(`Failed to parse optimization response: ${(err as Error).message}`);
    }
  }

  private static validateBullet(b: Record<string, unknown>): GeminiOptimizedBullet {
    return {
      index: Number(b.index) || 0,
      originalBullet: String(b.originalBullet ?? ''),
      optimizedBullet: String(b.optimizedBullet ?? ''),
      explanation: String(b.explanation ?? ''),
      confidenceScore: Math.max(0, Math.min(1, Number(b.confidenceScore) || 0)),
      keywordsUsed: Array.isArray(b.keywordsUsed) ? b.keywordsUsed.map(String) : [],
    };
  }

  // ── Adapter Pattern: Gemini response → UI state ─────────────────

  private static adaptToUI(
    response: GeminiOptimizationResponse,
    payload: ResumeOptimizationPayload
  ): OptimizedBulletUI[] {
    return response.optimizedBullets.map((bullet) => {
      const experience = payload.professionalDNA.experience[bullet.index];

      return {
        id: `bullet-${bullet.index}-${Date.now()}`,
        index: bullet.index,
        company: experience?.company ?? 'Unknown',
        role: experience?.role ?? 'Unknown',
        originalBullet: bullet.originalBullet,
        optimizedBullet: bullet.optimizedBullet,
        explanation: bullet.explanation,
        confidenceScore: bullet.confidenceScore,
        confidenceLevel: GeminiOptimizationService.toConfidenceLevel(bullet.confidenceScore),
        keywordsUsed: bullet.keywordsUsed,
        status: 'pending',
      };
    });
  }

  private static toConfidenceLevel(score: number): ConfidenceLevel {
    if (score >= 0.7) return 'high';
    if (score >= 0.5) return 'medium';
    return 'low';
  }
}
