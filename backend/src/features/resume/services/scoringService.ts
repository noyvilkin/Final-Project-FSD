import type { GeminiClient } from '../../../common/services/geminiClient.js';
import { appLogger } from '../../../common/services/logger.js';
import type { IProfessionalDNA } from '../models/professionalDNA.model.js';
import type { OptimizationPromptBuilder } from '../prompts/optimizationPrompts.js';
import type {
  JobDescriptionInput,
  HardRuleMatchResult,
  SemanticSimilarityResult,
  HybridScoreResult,
} from '../types/optimization.types.js';

const HARD_RULE_WEIGHT = 0.4;
const SEMANTIC_WEIGHT  = 0.6;

export class ScoringService {
  /**
   * Combines hard-rule keyword matching (40%) with LLM-evaluated
   * semantic similarity (60%) to produce a 0-100 match score.
   */
  static async calculateHybridScore(
    dna: IProfessionalDNA,
    jd: JobDescriptionInput,
    geminiClient: GeminiClient,
    promptBuilder: OptimizationPromptBuilder,
  ): Promise<HybridScoreResult> {
    appLogger.info('[ScoringService] Calculating hybrid score');

    const hardRule = this.calculateHardRuleMatch(dna, jd);
    const semantic = await this.calculateSemanticSimilarity(
      dna, jd, geminiClient, promptBuilder,
    );

    const finalScore = Math.round(
      hardRule.score * HARD_RULE_WEIGHT + semantic.score * SEMANTIC_WEIGHT,
    );

    const gapsRemaining = this.deriveGapsRemaining(hardRule, semantic, jd);

    appLogger.info('[ScoringService] Hybrid score calculated', {
      finalScore,
      hardRuleScore: hardRule.score,
      semanticScore: semantic.score,
    });

    return { finalScore, hardRuleMatch: hardRule, semanticSimilarity: semantic, gapsRemaining };
  }

  /**
   * Hard-Rule Matching (40% weight):
   * Percentage of required JD skills found in the candidate's DNA.
   */
  static calculateHardRuleMatch(
    dna: IProfessionalDNA,
    jd: JobDescriptionInput,
  ): HardRuleMatchResult {
    const candidateSkills = new Set(
      [
        ...dna.skills.map(s => s.name.toLowerCase()),
        ...dna.experience.flatMap(e => e.extractedSkills.map(s => s.toLowerCase())),
      ],
    );

    const matched: string[] = [];
    const missing: string[] = [];

    for (const required of jd.requiredSkills) {
      const normalised = required.toLowerCase();
      if (candidateSkills.has(normalised) || this.fuzzyMatch(normalised, candidateSkills)) {
        matched.push(required);
      } else {
        missing.push(required);
      }
    }

    const score = jd.requiredSkills.length > 0
      ? Math.round((matched.length / jd.requiredSkills.length) * 100)
      : 100;

    return {
      score,
      matchedSkills: matched,
      missingSkills: missing,
      totalRequired: jd.requiredSkills.length,
    };
  }

  /**
   * Semantic Similarity (60% weight):
   * Uses a secondary LLM evaluation to compare the candidate's
   * professional essence against the JD's core responsibilities.
   */
  static async calculateSemanticSimilarity(
    dna: IProfessionalDNA,
    jd: JobDescriptionInput,
    geminiClient: GeminiClient,
    promptBuilder: OptimizationPromptBuilder,
  ): Promise<SemanticSimilarityResult> {
    try {
      const dnaEssence = this.buildDNAEssence(dna);
      const geminiPayload = promptBuilder.buildSemanticScoringPayload(
        dnaEssence,
        jd.coreResponsibilities,
      );

      const rawResponse = await geminiClient.generate(geminiPayload);
      return this.parseSemanticResponse(rawResponse);
    } catch (error) {
      appLogger.error('[ScoringService] Semantic scoring failed, falling back', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return this.fallbackSemanticScore(dna, jd);
    }
  }

  private static buildDNAEssence(dna: IProfessionalDNA): string {
    const skillsSummary = dna.skills
      .map(s => `${s.name} (${s.proficiencyLevel})`)
      .join(', ');

    const experienceSummary = dna.experience
      .map(e => `${e.role} at ${e.company}: ${e.description || 'No description'}`)
      .join('\n');

    const educationSummary = dna.education
      .map(e => `${e.degree} in ${e.fieldOfStudy} from ${e.institution}`)
      .join('\n');

    return [
      `Skills: ${skillsSummary || 'None listed'}`,
      `\nExperience:\n${experienceSummary || 'None listed'}`,
      `\nEducation:\n${educationSummary || 'None listed'}`,
    ].join('\n');
  }

  private static parseSemanticResponse(raw: string): SemanticSimilarityResult {
    try {
      let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      const jsonText = jsonMatch ? jsonMatch[0] : cleaned;

      const parsed = JSON.parse(jsonText);

      return {
        score: Math.min(100, Math.max(0, Number(parsed.semanticScore) || 0)),
        topMatchingAreas: Array.isArray(parsed.topMatchingAreas) ? parsed.topMatchingAreas.map(String) : [],
        weakAreas: Array.isArray(parsed.weakAreas) ? parsed.weakAreas.map(String) : [],
      };
    } catch {
      appLogger.error('[ScoringService] Failed to parse semantic response');
      return { score: 50, topMatchingAreas: [], weakAreas: [] };
    }
  }

  /**
   * Keyword-overlap fallback when the LLM call fails.
   */
  private static fallbackSemanticScore(
    dna: IProfessionalDNA,
    jd: JobDescriptionInput,
  ): SemanticSimilarityResult {
    const dnaText = this.buildDNAEssence(dna).toLowerCase();
    const topMatchingAreas: string[] = [];
    const weakAreas: string[] = [];

    for (const resp of jd.coreResponsibilities) {
      const words = resp.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const hits = words.filter(w => dnaText.includes(w)).length;
      if (hits / words.length >= 0.3) {
        topMatchingAreas.push(resp);
      } else {
        weakAreas.push(resp);
      }
    }

    const score = jd.coreResponsibilities.length > 0
      ? Math.round((topMatchingAreas.length / jd.coreResponsibilities.length) * 100)
      : 50;

    return { score, topMatchingAreas, weakAreas };
  }

  /**
   * Simple fuzzy matching: checks if any candidate skill contains the
   * required skill as a substring or vice versa (handles "React" vs "React.js").
   */
  private static fuzzyMatch(target: string, candidateSkills: Set<string>): boolean {
    for (const skill of candidateSkills) {
      if (skill.includes(target) || target.includes(skill)) return true;
      if (this.levenshteinDistance(skill, target) <= 2) return true;
    }
    return false;
  }

  private static levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= a.length; i++) matrix[i] = [i];
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost,
        );
      }
    }
    return matrix[a.length][b.length];
  }

  private static deriveGapsRemaining(
    hardRule: HardRuleMatchResult,
    semantic: SemanticSimilarityResult,
    _jd: JobDescriptionInput,
  ): string[] {
    const gaps = new Set<string>();

    for (const skill of hardRule.missingSkills) {
      gaps.add(`Missing required skill: ${skill}`);
    }

    for (const area of semantic.weakAreas) {
      gaps.add(`Weak alignment with: ${area}`);
    }

    return Array.from(gaps);
  }
}
