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
        // Lower temperature keeps rewrites faithful to the source bullet and
        // reduces the model's tendency to invent unearned keywords/skills.
        temperature: 0.2,
        maxOutputTokens: 8192,
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

      const validated = parsed.optimizedBullets
        .map(this.validateBullet)
        // Only keep suggestions that (a) actually change the bullet and
        // (b) add real ATS value — i.e. weave in a JD keyword the original
        // bullet didn't already have. This drops the cosmetic / "stiff"
        // rephrasings that add no keyword coverage and just feel spammy.
        .filter(
          (b: GeminiOptimizedBullet) =>
            this.isMeaningfulRewrite(b) && this.addsNewKeyword(b)
        );

      return {
        optimizedBullets: validated,
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

  private static stripMarkdown(text: string): string {
    return text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .replace(/_(.+?)_/g, '$1');
  }

  private static validateBullet(b: Record<string, unknown>): GeminiOptimizedBullet {
    // `experienceIndex` is the new field name; fall back to the legacy
    // `index` so responses/runs from the previous prompt still parse.
    const experienceIndex = Number(b.experienceIndex ?? b.index) || 0;
    return {
      experienceIndex,
      originalBullet: String(b.originalBullet ?? ''),
      optimizedBullet: GeminiOptimizationService.stripMarkdown(String(b.optimizedBullet ?? '')),
      explanation: String(b.explanation ?? ''),
      confidenceScore: Math.max(0, Math.min(1, Number(b.confidenceScore) || 0)),
      keywordsUsed: Array.isArray(b.keywordsUsed) ? b.keywordsUsed.map(String) : [],
    };
  }

  /**
   * A rewrite is only worth surfacing if it is non-empty and differs
   * meaningfully from the original bullet (ignoring case, punctuation
   * and whitespace). This backstops the prompt's "omit unchanged bullets"
   * instruction so no no-op suggestions reach the UI.
   */
  private static isMeaningfulRewrite(b: GeminiOptimizedBullet): boolean {
    const optimized = b.optimizedBullet.trim();
    if (!optimized) return false;

    return this.normalizeText(optimized) !== this.normalizeText(b.originalBullet);
  }

  /**
   * True only when the rewrite introduces at least one JD keyword that the
   * original bullet did not already contain. A rewrite that adds no new
   * keyword is cosmetic (reworded/reordered/synonym-swapped) and is not
   * worth surfacing — this is what keeps the suggestions from feeling
   * spammy when every bullet is optimized individually.
   */
  private static addsNewKeyword(b: GeminiOptimizedBullet): boolean {
    if (b.keywordsUsed.length === 0) return false;

    const original = ` ${this.normalizeText(b.originalBullet)} `;
    return b.keywordsUsed.some((kw) => {
      const k = this.normalizeText(kw);
      return k.length > 0 && !original.includes(` ${k} `);
    });
  }

  private static normalizeText(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // ── Adapter Pattern: Gemini response → UI state ─────────────────

  private static adaptToUI(
    response: GeminiOptimizationResponse,
    payload: ResumeOptimizationPayload
  ): OptimizedBulletUI[] {
    return response.optimizedBullets.map((bullet, i) => {
      const experience = payload.professionalDNA.experience[bullet.experienceIndex];

      return {
        // Several bullets can share the same experienceIndex, so include
        // the position `i` to keep every UI id unique.
        id: `bullet-${bullet.experienceIndex}-${i}-${Date.now()}`,
        index: bullet.experienceIndex,
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
