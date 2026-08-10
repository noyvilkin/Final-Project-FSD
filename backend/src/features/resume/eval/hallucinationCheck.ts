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
  field:
    | 'skill'
    | 'company'
    | 'institution'
    | 'lastRoleCompany'
    | 'lastRoleTitle'
    | 'topSkill'
    | 'skillYears'
    | 'totalYears'
    | 'gpa';
  value: string;
}

export interface HallucinationCheckResult {
  totalChecked: number;
  hallucinated: HallucinationItem[];
  /** 0 = perfect (zero hallucination), 1 = everything hallucinated. */
  hallucinationRate: number;
}

// ── Numeric-field grounding ─────────────────────────────────────────
//
// Entity names being grounded is not enough: the extractor also emits
// numbers (per-skill years, total experience, GPA) that are shown to
// users, and a model can fabricate those while every name checks out.
// These flags measure raw model behavior: nothing in the production
// pipeline filters numeric fields, so anything flagged here also
// reaches the database. Rules, fixed a priori:
//
//   - skill.yearsOfExperience is grounded when the resume explicitly
//     states that number of years on a line mentioning the skill
//     (e.g. "React – 3 years"), OR when it is consistent with the
//     timeline of the extracted roles that use the skill: it may not
//     exceed that span by more than 1 year of rounding tolerance.
//     (Prompt rule 4a: stated numbers are copied, unstated ones are
//     calculated from the dated roles — a value above every derivable
//     bound is a default/guess, e.g. "2 years" stamped on everything.)
//     Skills that appear in no dated role fall back to the full career
//     span as the bound.
//   - totalYearsOfExperience may be estimated from the experience
//     timeline (the prompt says so), but may not exceed the full
//     timeline span by more than 1 year of rounding tolerance.
//     Underclaiming is allowed: employment gaps shrink the estimate.
//   - GPA / gradeAverage: the digits must appear in the resume text.

const YEARS_PATTERN = /(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)/gi;

/**
 * True when some line of the resume both mentions the skill and states
 * the claimed number of years.
 */
function isSkillYearsStated(
  skillName: string,
  claimedYears: number,
  rawResumeText: string
): boolean {
  const skill = normalize(skillName);
  if (skill.length === 0) return true;

  for (const line of rawResumeText.split(/\r?\n/)) {
    const l = normalize(line);
    if (!l.includes(skill)) continue;

    for (const match of l.matchAll(YEARS_PATTERN)) {
      if (Number(match[1]) === claimedYears) return true;
    }
  }
  return false;
}

/** Span in years from the earliest start to the latest end (or now) of the given entries. */
function timelineSpanYears(experience: ParsedDNA['experience']): number | null {
  let earliest: number | null = null;
  let latest: number | null = null;

  for (const exp of experience) {
    const start = Date.parse(exp.startDate);
    if (!Number.isNaN(start)) {
      earliest = earliest === null ? start : Math.min(earliest, start);
    }
    const end = exp.isCurrent || !exp.endDate ? Date.now() : Date.parse(exp.endDate);
    if (!Number.isNaN(end)) {
      latest = latest === null ? end : Math.max(latest, end);
    }
  }

  if (earliest === null || latest === null || latest < earliest) return null;
  return (latest - earliest) / (1000 * 60 * 60 * 24 * 365.25);
}

/**
 * Upper bound (in years) that a skill's claimed experience can be
 * defended with: the timeline span of the roles that actually use the
 * skill (named in extractedSkills or mentioned in the description),
 * falling back to the full career span when no dated role uses it.
 */
function skillYearsBound(
  skillName: string,
  experience: ParsedDNA['experience']
): number | null {
  const skill = normalize(skillName);

  const usingSkill = experience.filter((exp) => {
    if (exp.extractedSkills.some((s) => normalize(s) === skill)) return true;
    // Substring match only for names long enough not to appear by accident
    // inside unrelated words (e.g. "Go" in "Google").
    return skill.length >= 3 && normalize(exp.description ?? '').includes(skill);
  });

  const bound = timelineSpanYears(usingSkill);
  return bound !== null ? bound : timelineSpanYears(experience);
}

/** True when the GPA's digits appear in the resume text (e.g. 3.7 → "3.7"). */
function isGpaStated(gpa: number, haystack: string): boolean {
  const candidates = new Set([String(gpa), gpa.toFixed(1), gpa.toFixed(2)]);
  for (const c of candidates) {
    if (haystack.includes(c)) return true;
  }
  return false;
}

export function checkHallucinations(
  parsed: ParsedDNA,
  rawResumeText: string
): HallucinationCheckResult {
  const haystack = normalize(rawResumeText);
  const hallucinated: HallucinationItem[] = [];

  let numericChecked = 0;

  for (const skill of parsed.skills) {
    if (!isGrounded(skill.name, haystack)) {
      hallucinated.push({ field: 'skill', value: skill.name });
    }

    if (skill.yearsOfExperience != null) {
      numericChecked += 1;
      if (!isSkillYearsStated(skill.name, skill.yearsOfExperience, rawResumeText)) {
        const bound = skillYearsBound(skill.name, parsed.experience);
        if (bound === null) {
          hallucinated.push({
            field: 'skillYears',
            value: `${skill.name}: ${skill.yearsOfExperience} years (not stated, and no dated experience to derive it from)`,
          });
        } else if (skill.yearsOfExperience > bound + 1) {
          hallucinated.push({
            field: 'skillYears',
            value: `${skill.name}: ${skill.yearsOfExperience} years exceeds the ${bound.toFixed(1)}y timeline of roles using it`,
          });
        }
      }
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

    if (edu.gpa != null) {
      numericChecked += 1;
      if (!isGpaStated(edu.gpa, haystack)) {
        hallucinated.push({
          field: 'gpa',
          value: `${edu.institution}: GPA ${edu.gpa} (not stated in resume)`,
        });
      }
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

  const totalYears = summary.totalYearsOfExperience;
  if (totalYears != null) {
    numericChecked += 1;
    const span = timelineSpanYears(parsed.experience);
    if (span === null) {
      hallucinated.push({
        field: 'totalYears',
        value: `totalYearsOfExperience=${totalYears} with no usable experience timeline`,
      });
    } else if (totalYears > span + 1) {
      hallucinated.push({
        field: 'totalYears',
        value: `totalYearsOfExperience=${totalYears} exceeds the timeline span of ${span.toFixed(1)}y`,
      });
    }
  }

  const gradeAverage = summary.gradeAverage;
  if (gradeAverage != null) {
    numericChecked += 1;
    if (!isGpaStated(gradeAverage, haystack)) {
      hallucinated.push({
        field: 'gpa',
        value: `profileSummary.gradeAverage=${gradeAverage} (not stated in resume)`,
      });
    }
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
    summary.topSkills.length +
    numericChecked;

  const hallucinationRate = totalChecked === 0 ? 0 : hallucinated.length / totalChecked;

  return { totalChecked, hallucinated, hallucinationRate };
}
