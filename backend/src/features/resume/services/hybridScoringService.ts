import { GeminiClient } from '../../../common/services/geminiClient.js';
import type { GeminiPayload } from '../../../common/types/geminiTypes.js';
import { appLogger } from '../../../common/services/logger.js';

import {
  SEMANTIC_SCORING_SYSTEM_INSTRUCTION,
  buildSemanticScoringUserMessage,
} from '../prompts/optimizationPrompts.js';

import type { ResumeOptimizationPayload } from '../types/resumeOptimization.types.js';
import type {
  HybridScoreBreakdown,
  GeminiSemanticScoreResponse,
} from '../types/aiOptimization.types.js';

const HARD_RULE_WEIGHT = 0.4;
const SEMANTIC_WEIGHT  = 0.6;

export class HybridScoringService {
  private static geminiClient: GeminiClient | null = null;

  private static getClient(): GeminiClient {
    if (!this.geminiClient) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is required');

      this.geminiClient = new GeminiClient({
        apiKey,
        model: 'gemini-2.5-flash',
        temperature: 0.2,
        maxOutputTokens: 4096,
        rateLimiter: { requestsPerMinute: 8, requestsPerDay: 1200 },
      });
    }
    return this.geminiClient;
  }

  /**
   * Combines Hard-Rule Matching (40%) and Semantic Similarity (60%)
   * into a single 0-100 match score.
   */
  static async calculateHybridScore(
    payload: ResumeOptimizationPayload
  ): Promise<HybridScoreBreakdown> {
    const hardRuleResult = this.calculateHardRuleScore(payload);

    let semanticResult: GeminiSemanticScoreResponse;
    try {
      semanticResult = await this.calculateSemanticScore(payload);
    } catch (err) {
      appLogger.warn('[HybridScoringService] Semantic scoring failed, using hard-rule only', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
      semanticResult = {
        semanticScore: hardRuleResult.score,
        reasoning: 'Semantic analysis unavailable — using hard-rule score as fallback.',
        strongMatches: [],
        weakMatches: [],
      };
    }

    const finalScore = Math.round(
      hardRuleResult.score * HARD_RULE_WEIGHT +
      semanticResult.semanticScore * SEMANTIC_WEIGHT
    );

    appLogger.info('[HybridScoringService] Hybrid score calculated', {
      hardRule: hardRuleResult.score,
      semantic: semanticResult.semanticScore,
      final: finalScore,
    });

    return {
      hardRuleScore: hardRuleResult.score,
      hardRuleWeight: HARD_RULE_WEIGHT,
      semanticScore: semanticResult.semanticScore,
      semanticWeight: SEMANTIC_WEIGHT,
      finalScore,
      hardRuleDetails: {
        totalRequired: hardRuleResult.totalRequired,
        totalMatched: hardRuleResult.totalMatched,
        matchedSkills: hardRuleResult.matchedSkills,
        missingSkills: hardRuleResult.missingSkills,
      },
      semanticDetails: {
        score: semanticResult.semanticScore,
        reasoning: semanticResult.reasoning,
        strongMatches: semanticResult.strongMatches,
        weakMatches: semanticResult.weakMatches,
      },
    };
  }

  // ── Hard-Rule Matching (40% weight) ─────────────────────────────
  // Percentage of required "Hard Skills" found in DNA vs JD.

  private static calculateHardRuleScore(payload: ResumeOptimizationPayload): {
    score: number;
    totalRequired: number;
    totalMatched: number;
    matchedSkills: string[];
    missingSkills: string[];
  } {
    const { alignment } = payload;
    const hardSkillBreakdown = alignment.categoryBreakdown.hardSkills;

    const totalRequired = hardSkillBreakdown.matched.length + hardSkillBreakdown.missing.length;
    const totalMatched  = hardSkillBreakdown.matched.length;

    const score = totalRequired === 0
      ? 0
      : Math.round((totalMatched / totalRequired) * 100);

    return {
      score,
      totalRequired,
      totalMatched,
      matchedSkills: hardSkillBreakdown.matched,
      missingSkills: hardSkillBreakdown.missing,
    };
  }

  // ── Semantic Similarity (60% weight) ────────────────────────────
  // Uses a secondary LLM evaluation to compare Professional DNA
  // essence against JD core responsibilities.

  private static async calculateSemanticScore(
    payload: ResumeOptimizationPayload
  ): Promise<GeminiSemanticScoreResponse> {
    const dnaEssence = this.buildDNAEssence(payload);
    const jdResponsibilities = payload.normalizedJD.cleanText;

    const userMessage = buildSemanticScoringUserMessage(dnaEssence, jdResponsibilities);

    const geminiPayload: GeminiPayload = {
      system_instruction: {
        parts: [{ text: SEMANTIC_SCORING_SYSTEM_INSTRUCTION }],
      },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    };

    const client = this.getClient();
    const rawResponse = await client.generate(geminiPayload);

    return this.parseSemanticResponse(rawResponse);
  }

  private static buildDNAEssence(payload: ResumeOptimizationPayload): string {
    const { professionalDNA } = payload;
    const parts: string[] = [];

    if (professionalDNA.skills.length > 0) {
      const grouped = professionalDNA.skills.reduce((acc, s) => {
        (acc[s.category] ??= []).push(`${s.name} (${s.proficiencyLevel})`);
        return acc;
      }, {} as Record<string, string[]>);

      for (const [category, skills] of Object.entries(grouped)) {
        parts.push(`${category}: ${skills.join(', ')}`);
      }
    }

    if (professionalDNA.experience.length > 0) {
      parts.push('\nExperience:');
      for (const exp of professionalDNA.experience) {
        const period = exp.endDate ? `${exp.startDate} - ${exp.endDate}` : `${exp.startDate} - Present`;
        parts.push(`- ${exp.role} at ${exp.company} (${period}): ${exp.description || 'No description'}`);
      }
    }

    if (professionalDNA.education.length > 0) {
      parts.push('\nEducation:');
      for (const edu of professionalDNA.education) {
        parts.push(`- ${edu.degree} in ${edu.fieldOfStudy} from ${edu.institution}`);
      }
    }

    return parts.join('\n') || 'No professional DNA data available.';
  }

  private static parseSemanticResponse(raw: string): GeminiSemanticScoreResponse {
    try {
      const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      const jsonText = jsonMatch ? jsonMatch[0] : cleaned;
      const parsed = JSON.parse(jsonText);

      return {
        semanticScore: Math.max(0, Math.min(100, Number(parsed.semanticScore) || 0)),
        reasoning: String(parsed.reasoning ?? ''),
        strongMatches: Array.isArray(parsed.strongMatches) ? parsed.strongMatches.map(String) : [],
        weakMatches: Array.isArray(parsed.weakMatches) ? parsed.weakMatches.map(String) : [],
      };
    } catch (err) {
      appLogger.error('[HybridScoringService] Failed to parse semantic response', {
        error: err instanceof Error ? err.message : 'Unknown',
        rawPreview: raw.substring(0, 500),
      });
      throw new Error(`Failed to parse semantic scoring response: ${(err as Error).message}`);
    }
  }
}
