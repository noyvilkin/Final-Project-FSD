/**
 * "Bullet Faithfulness" — verifies that the OPTIMIZER's output is
 * trustworthy. This is the AI surface the user actually reads, and
 * the failure modes are different from the DNA extractor.
 *
 * Three sub-checks, all deterministic (no LLM judge):
 *
 *   1. DNA support (100% rule)
 *      Every keyword the optimizer claims to have used must trace
 *      back to the candidate's Professional DNA — either as a
 *      declared skill, a token in an original bullet, or an extracted
 *      skill from an experience entry. Anything outside this evidence
 *      pool is a hallucinated addition.
 *
 *   2. ATS-friendly suggestion ratio
 *      Count what fraction of the keywords used are in the JD's
 *      hard-skill / tool / certification buckets (ATS-relevant) vs
 *      methodology / non-keyword (often soft skills that ATS ignore).
 *
 *   3. Critical missing-keyword coverage
 *      The system already exposes alignment.missingSkills. We report
 *      how many of those gaps are surfaced back to the user via the
 *      optimization output's gapsRemaining list.
 */

import type {
  KeywordExtractionResult,
  ProfessionalDNASummary,
  AlignmentResult,
} from '../types/resumeOptimization.types.js';
import type { OptimizationDashboardData, OptimizedBulletUI } from '../types/aiOptimization.types.js';

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Builds the "evidence pool" against which the optimizer's claimed
 * keywords are checked. A keyword is considered DNA-supported if it
 * appears anywhere inside this concatenated, lowercased string.
 */
function buildDnaEvidencePool(dna: ProfessionalDNASummary): string {
  const parts: string[] = [];
  for (const s of dna.skills) parts.push(s.name);
  for (const exp of dna.experience) {
    parts.push(exp.role);
    parts.push(exp.company);
    if (exp.description) parts.push(exp.description);
    parts.push(...exp.extractedSkills);
  }
  for (const edu of dna.education) {
    parts.push(edu.fieldOfStudy);
    parts.push(edu.degree);
    parts.push(edu.institution);
  }
  if (dna.rawResumeText) parts.push(dna.rawResumeText);
  return normalize(parts.join(' \n '));
}

/**
 * Returns the set of keyword terms (case-insensitive) that are
 * considered ATS-relevant — i.e. hard skills, tools, or certifications
 * that ATS systems actually scan for. Methodologies are intentionally
 * excluded: terms like "Agile" or "Scrum" are often listed in JDs but
 * are usually noise from an ATS-keyword-matching standpoint.
 */
function buildAtsRelevantSet(keywords: KeywordExtractionResult): Set<string> {
  const set = new Set<string>();
  for (const k of [...keywords.hardSkills, ...keywords.tools, ...keywords.certifications]) {
    set.add(normalize(k));
  }
  return set;
}

export interface PerBulletFaithfulness {
  index: number;
  keywordsUsed: string[];
  unsupportedKeywords: string[];
  atsKeywords: string[];
  nonAtsKeywords: string[];
}

export interface FaithfulnessResult {
  bullets: PerBulletFaithfulness[];

  // Aggregate "100% DNA support" metric
  totalKeywordsUsed: number;
  totalSupported: number;
  totalUnsupported: number;
  /** 1.0 means every keyword the optimizer claimed is DNA-grounded. */
  dnaSupportRate: number;

  // ATS-friendliness aggregate
  totalAtsKeywords: number;
  totalNonAtsKeywords: number;
  /** Fraction of used keywords that are ATS-relevant (higher = better). */
  atsRelevanceRate: number;

  // Missing-keyword coverage
  missingSkillsTotal: number;
  missingSkillsSurfaced: number;
  /** Fraction of alignment.missingSkills that were surfaced in gapsRemaining. */
  missingCoverageRate: number;
}

export function checkBulletFaithfulness(
  optimization: OptimizationDashboardData,
  dna: ProfessionalDNASummary,
  jdKeywords: KeywordExtractionResult,
  alignment: AlignmentResult
): FaithfulnessResult {
  const evidence = buildDnaEvidencePool(dna);
  const atsSet = buildAtsRelevantSet(jdKeywords);

  const perBullet: PerBulletFaithfulness[] = [];

  let totalUsed = 0;
  let totalSupported = 0;
  let totalAts = 0;
  let totalNonAts = 0;

  for (const bullet of optimization.bullets as OptimizedBulletUI[]) {
    const unsupported: string[] = [];
    const ats: string[] = [];
    const nonAts: string[] = [];

    for (const kw of bullet.keywordsUsed) {
      const n = normalize(kw);
      if (n.length === 0) continue;
      totalUsed += 1;

      // 1. DNA support check
      if (evidence.includes(n)) {
        totalSupported += 1;
      } else {
        unsupported.push(kw);
      }

      // 2. ATS-friendliness classification
      if (atsSet.has(n)) {
        ats.push(kw);
        totalAts += 1;
      } else {
        nonAts.push(kw);
        totalNonAts += 1;
      }
    }

    perBullet.push({
      index: bullet.index,
      keywordsUsed: bullet.keywordsUsed,
      unsupportedKeywords: unsupported,
      atsKeywords: ats,
      nonAtsKeywords: nonAts,
    });
  }

  const dnaSupportRate = totalUsed === 0 ? 1 : totalSupported / totalUsed;
  const atsRelevanceRate = totalUsed === 0 ? 0 : totalAts / totalUsed;

  // 3. Missing-keyword coverage
  const missingSkills = alignment.missingSkills.map(normalize);
  const surfaced = new Set(optimization.gapsRemaining.map(normalize));
  const surfacedCount = missingSkills.filter((m) => surfaced.has(m)).length;
  const missingCoverageRate = missingSkills.length === 0 ? 1 : surfacedCount / missingSkills.length;

  return {
    bullets: perBullet,
    totalKeywordsUsed: totalUsed,
    totalSupported,
    totalUnsupported: totalUsed - totalSupported,
    dnaSupportRate,
    totalAtsKeywords: totalAts,
    totalNonAtsKeywords: totalNonAts,
    atsRelevanceRate,
    missingSkillsTotal: missingSkills.length,
    missingSkillsSurfaced: surfacedCount,
    missingCoverageRate,
  };
}
