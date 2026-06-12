/**
 * "Zero Hallucination" check for the DNA extractor.
 *
 * Strategy: every concrete entity the AI claims to have extracted
 * (skill name, company, institution, recent role title, top-skill name)
 * must be *grounded* in the original resume text — i.e. it must appear
 * there, modulo a small synonym map and whitespace normalization.
 *
 * No second AI is involved here on purpose: the check is deterministic,
 * reproducible, and defensible in a project report.
 */

import type { ParsedDNA } from '../services/resumeParsingService.js';

/**
 * Lightweight synonym/alias map for common technical terms that appear
 * abbreviated in resumes. Keep this list very small and very obvious —
 * anything more aggressive risks masking real hallucinations.
 */
const SYNONYMS: Record<string, string[]> = {
  javascript: ['js'],
  typescript: ['ts'],
  'node.js': ['nodejs', 'node'],
  postgresql: ['postgres'],
  kubernetes: ['k8s'],
  'amazon web services': ['aws'],
  'github actions': ['gha'],
  'rest api': ['rest', 'restful api'],
  'continuous integration': ['ci'],
  'continuous delivery': ['cd'],
  'continuous deployment': ['cd'],
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Returns true if `needle` appears in `haystack` (case-insensitive),
 * either directly or via a known synonym.
 */
function isGrounded(needle: string, haystack: string): boolean {
  const n = normalize(needle);
  if (n.length === 0) return true;

  if (haystack.includes(n)) return true;

  const aliases = SYNONYMS[n] ?? [];
  for (const alias of aliases) {
    if (haystack.includes(alias)) return true;
  }

  // Also check the reverse direction: maybe the resume uses the long
  // form ("JavaScript") and the AI returned the alias ("JS").
  for (const [canonical, aliasList] of Object.entries(SYNONYMS)) {
    if (aliasList.includes(n) && haystack.includes(canonical)) return true;
  }

  return false;
}

export interface HallucinationItem {
  field: 'skill' | 'company' | 'institution' | 'lastRoleCompany' | 'lastRoleTitle' | 'topSkill';
  value: string;
}

export interface HallucinationCheckResult {
  totalChecked: number;
  hallucinated: HallucinationItem[];
  /** 0 = perfect (zero hallucination), 1 = everything hallucinated. */
  hallucinationRate: number;
}

export function checkHallucinations(
  parsed: ParsedDNA,
  rawResumeText: string
): HallucinationCheckResult {
  const haystack = normalize(rawResumeText);
  const hallucinated: HallucinationItem[] = [];

  for (const skill of parsed.skills) {
    if (!isGrounded(skill.name, haystack)) {
      hallucinated.push({ field: 'skill', value: skill.name });
    }
  }

  for (const exp of parsed.experience) {
    if (!isGrounded(exp.company, haystack)) {
      hallucinated.push({ field: 'company', value: exp.company });
    }
  }

  for (const edu of parsed.education) {
    if (!isGrounded(edu.institution, haystack)) {
      hallucinated.push({ field: 'institution', value: edu.institution });
    }
  }

  // profileSummary cross-checks — these must be derived from data
  // already in the resume, never invented.
  const summary = parsed.profileSummary;
  if (summary.lastRoleCompany && !isGrounded(summary.lastRoleCompany, haystack)) {
    hallucinated.push({ field: 'lastRoleCompany', value: summary.lastRoleCompany });
  }
  if (summary.lastRoleTitle && !isGrounded(summary.lastRoleTitle, haystack)) {
    hallucinated.push({ field: 'lastRoleTitle', value: summary.lastRoleTitle });
  }

  const skillNames = new Set(parsed.skills.map((s) => normalize(s.name)));
  for (const top of summary.topSkills) {
    // topSkills must be a subset of the names in the skills array
    // (this is rule #8 in dnaExtractionPrompts.ts).
    if (!skillNames.has(normalize(top))) {
      hallucinated.push({ field: 'topSkill', value: top });
    }
  }

  const totalChecked =
    parsed.skills.length +
    parsed.experience.length +
    parsed.education.length +
    (summary.lastRoleCompany ? 1 : 0) +
    (summary.lastRoleTitle ? 1 : 0) +
    summary.topSkills.length;

  const hallucinationRate = totalChecked === 0 ? 0 : hallucinated.length / totalChecked;

  return { totalChecked, hallucinated, hallucinationRate };
}
