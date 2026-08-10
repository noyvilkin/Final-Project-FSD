import { createLLMClient } from '../../../common/services/llmClientFactory.js';
import { resolveModelForModule } from '../../../common/services/llmModuleConfig.js';
import type { LLMClient } from '../../../common/services/llmClient.js';
import type { LLMPayload } from '../../../common/types/llmTypes.js';
import { appLogger } from '../../../common/services/logger.js';

import {
  SYSTEM_INSTRUCTION,
  PROMPT_VERSION,
  buildOptimizationUserMessage,
} from '../prompts/optimizationPrompts.js';

import type { ResumeOptimizationPayload } from '../types/resumeOptimization.types.js';
import { splitBullets } from '../utils/bulletText.js';
import type {
  LLMOptimizationResponse,
  LLMOptimizedBullet,
  OptimizedBulletUI,
  OptimizationDashboardData,
  ConfidenceLevel,
} from '../types/aiOptimization.types.js';

import { HybridScoringService } from './hybridScoringService.js';

export class LLMOptimizationService {
  private static llmClient: LLMClient | null = null;

  private static getClient(): LLMClient {
    if (!this.llmClient) {
      this.llmClient = createLLMClient({
        model: resolveModelForModule('resume'),
        // Lower temperature keeps rewrites faithful to the source bullet and
        // reduces the model's tendency to invent unearned keywords/skills.
        temperature: 0.2,
        maxOutputTokens: 8192,
      });
    }
    return this.llmClient;
  }

  // ── Main orchestrator ───────────────────────────────────────────

  static async optimizeResume(
    payload: ResumeOptimizationPayload
  ): Promise<OptimizationDashboardData> {
    appLogger.info('[LLMOptimizationService] Starting resume optimization', {
      userId: payload.professionalDNA.userId,
      bulletCount: payload.professionalDNA.experience.length,
    });

    const [llmResponse, hybridScore] = await Promise.all([
      this.callLLMForOptimization(payload),
      HybridScoringService.calculateHybridScore(payload),
    ]);

    const adapted = this.adaptToUI(llmResponse, payload);

    return {
      bullets: adapted,
      generalAdvice: llmResponse.generalAdvice,
      hybridScore,
      gapsRemaining: payload.alignment.missingSkills,
      meta: {
        generatedAt: new Date().toISOString(),
        promptVersion: PROMPT_VERSION,
        modelUsed: this.getClient().model,
      },
    };
  }

  // ── LLM call ─────────────────────────────────────────────────

  private static async callLLMForOptimization(
    payload: ResumeOptimizationPayload
  ): Promise<LLMOptimizationResponse> {
    const userMessage = buildOptimizationUserMessage(payload);

    const llmPayload: LLMPayload = {
      system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    };

    const client = this.getClient();
    const rawResponse = await client.generate(llmPayload);

    appLogger.info('[LLMOptimizationService] LLM response received', {
      responseLength: rawResponse.length,
    });

    return this.parseOptimizationResponse(rawResponse);
  }

  // ── Response parsing ────────────────────────────────────────────

  private static parseOptimizationResponse(raw: string): LLMOptimizationResponse {
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
        // Only keep suggestions that actually change the bullet — the system
        // prompt already constrains keywordsUsed to terms the candidate's DNA
        // genuinely supports, so a separate "is this keyword new" check isn't
        // needed and was actively wrong for non-Latin-script resumes (it
        // normalized text to [a-z0-9] only, stripping e.g. Hebrew/Arabic
        // originals down to nothing and making every keyword look "already
        // present").
        .filter((b: LLMOptimizedBullet) => this.isMeaningfulRewrite(b));

      return {
        optimizedBullets: validated,
        generalAdvice: String(parsed.generalAdvice ?? ''),
      };
    } catch (err) {
      appLogger.error('[LLMOptimizationService] Failed to parse LLM response', {
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

  private static validateBullet(b: Record<string, unknown>): LLMOptimizedBullet {
    // `experienceIndex` is the new field name; fall back to the legacy
    // `index` so responses/runs from the previous prompt still parse.
    const experienceIndex = Number(b.experienceIndex ?? b.index) || 0;
    return {
      experienceIndex,
      originalBullet: String(b.originalBullet ?? ''),
      optimizedBullet: LLMOptimizationService.stripMarkdown(String(b.optimizedBullet ?? '')),
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
  private static isMeaningfulRewrite(b: LLMOptimizedBullet): boolean {
    const optimized = b.optimizedBullet.trim();
    if (!optimized) return false;

    return this.normalizeText(optimized) !== this.normalizeText(b.originalBullet);
  }

  private static normalizeText(s: string): string {
    // Unicode-aware: [^a-z0-9] would strip non-Latin scripts (e.g. Hebrew)
    // to an empty string, making every non-Latin bullet look identical.
    return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  }

  // ── Adapter Pattern: LLM response → UI state ─────────────────

  /**
   * Resolve which experience entry a rewrite belongs to by locating its
   * originalBullet among each job's bullets (split with the same
   * splitBullets used to build the prompt). The model's claimed
   * experienceIndex is only a fallback: smaller models often number
   * bullets sequentially instead of copying the job index verbatim,
   * which would attribute rewrites to the wrong job (or "Unknown").
   */
  private static resolveExperienceIndex(
    bullet: LLMOptimizedBullet,
    experience: ResumeOptimizationPayload['professionalDNA']['experience']
  ): number {
    const target = this.normalizeText(bullet.originalBullet);
    if (target) {
      for (let i = 0; i < experience.length; i++) {
        const bullets = splitBullets(experience[i].description || '');
        if (bullets.some((b) => this.normalizeText(b) === target)) return i;
      }
    }
    return bullet.experienceIndex;
  }

  private static adaptToUI(
    response: LLMOptimizationResponse,
    payload: ResumeOptimizationPayload
  ): OptimizedBulletUI[] {
    return response.optimizedBullets.map((bullet, i) => {
      const experienceIndex = LLMOptimizationService.resolveExperienceIndex(
        bullet,
        payload.professionalDNA.experience
      );
      const experience = payload.professionalDNA.experience[experienceIndex];

      return {
        // Several bullets can share the same experienceIndex, so include
        // the position `i` to keep every UI id unique.
        id: `bullet-${experienceIndex}-${i}-${Date.now()}`,
        index: experienceIndex,
        company: experience?.company ?? 'Unknown',
        role: experience?.role ?? 'Unknown',
        originalBullet: bullet.originalBullet,
        optimizedBullet: bullet.optimizedBullet,
        explanation: bullet.explanation,
        confidenceScore: bullet.confidenceScore,
        confidenceLevel: LLMOptimizationService.toConfidenceLevel(bullet.confidenceScore),
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
