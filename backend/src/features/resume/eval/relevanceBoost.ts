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
import { splitBullets } from '../utils/bulletText.js';

function normalize(text: string): string {
  return text.toLowerCase();
}

/** Unicode-aware normalization for matching a rewrite back to its source bullet. */
function normalizeBullet(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
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
 * Builds a copy of the original payload where every accepted rewrite is
 * spliced into its job's description IN PLACE of the specific original
 * bullet it rewrote. Bullets the optimizer didn't touch are kept verbatim.
 *
 * Rewrites are matched back to their source bullet by (normalized) text,
 * not by the model-reported experience index — the index is unreliable
 * (smaller models number bullets sequentially), and matching by index
 * used to overwrite a whole multi-bullet job description with a single
 * bullet, destroying content and deflating the "after" measurement.
 *
 * Used to recompute the hybrid score "AFTER" optimization without touching
 * the database.
 */
export function applyOptimizedBulletsToPayload(
  payload: ResumeOptimizationPayload,
  optimization: OptimizationDashboardData
): ResumeOptimizationPayload {
  const rewriteByOriginal = new Map<string, string>();
  for (const b of optimization.bullets) {
    const key = normalizeBullet(b.originalBullet);
    if (key && !rewriteByOriginal.has(key)) {
      rewriteByOriginal.set(key, b.optimizedBullet);
    }
  }

  const updatedExperience = payload.professionalDNA.experience.map((exp) => {
    const bullets = splitBullets(exp.description || '');
    if (bullets.length === 0) return exp;

    let changed = false;
    const merged = bullets.map((original) => {
      const rewrite = rewriteByOriginal.get(normalizeBullet(original));
      if (rewrite) {
        changed = true;
        return rewrite;
      }
      return original;
    });

    return changed ? { ...exp, description: merged.join('\n') } : exp;
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
