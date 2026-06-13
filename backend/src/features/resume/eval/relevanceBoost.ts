/**
 * "Relevance Boost" measurement.
 *
 * For a (resume, JD) pair, we measure two things:
 *
 *   1. hybridScore BEFORE optimization vs hybridScore AFTER optimization
 *      — using the system's own HybridScoringService. This is the
 *      headline number the project actually optimizes for.
 *
 *   2. Keyword-incorporation rate: how many JD hard-skill keywords
 *      appear in the experience bullets before vs after rewriting.
 *      This is a fully-deterministic sanity check — it requires no
 *      LLM at all and is impossible to "fudge".
 */

import type { ResumeOptimizationPayload } from '../types/resumeOptimization.types.js';
import type { OptimizationDashboardData } from '../types/aiOptimization.types.js';
import type { IExperience } from '../types/professionalDNA.types.js';

function normalize(text: string): string {
  return text.toLowerCase();
}

/**
 * Counts how many distinct JD hard-skill keywords appear (as substrings,
 * case-insensitive) anywhere across the given experience descriptions.
 */
export function countKeywordIncorporation(
  experience: Pick<IExperience, 'description'>[],
  jdHardSkills: string[]
): { matched: string[]; total: number } {
  const haystack = normalize(experience.map((e) => e.description ?? '').join(' \n '));
  const matched: string[] = [];

  for (const keyword of jdHardSkills) {
    if (keyword.trim().length === 0) continue;
    if (haystack.includes(normalize(keyword))) {
      matched.push(keyword);
    }
  }

  return { matched, total: jdHardSkills.length };
}

/**
 * Builds a copy of the original payload where each experience.description
 * has been replaced with the optimized bullet returned by the AI.
 *
 * Used to recompute the hybrid score "AFTER" optimization without touching
 * the database.
 */
export function applyOptimizedBulletsToPayload(
  payload: ResumeOptimizationPayload,
  optimization: OptimizationDashboardData
): ResumeOptimizationPayload {
  const updatedExperience = payload.professionalDNA.experience.map((exp, idx) => {
    const optimized = optimization.bullets.find((b) => b.index === idx);
    if (!optimized) return exp;
    return { ...exp, description: optimized.optimizedBullet };
  });

  return {
    ...payload,
    professionalDNA: {
      ...payload.professionalDNA,
      experience: updatedExperience,
    },
  };
}

export interface RelevanceBoostResult {
  scoreBefore: number;
  scoreAfter: number;
  boost: number;
  keywordIncorporationBefore: { matched: string[]; total: number };
  keywordIncorporationAfter: { matched: string[]; total: number };
  keywordBoost: number;
}

export function computeRelevanceBoost(
  scoreBefore: number,
  scoreAfter: number,
  before: { matched: string[]; total: number },
  after: { matched: string[]; total: number }
): RelevanceBoostResult {
  return {
    scoreBefore,
    scoreAfter,
    boost: scoreAfter - scoreBefore,
    keywordIncorporationBefore: before,
    keywordIncorporationAfter: after,
    keywordBoost: after.matched.length - before.matched.length,
  };
}
