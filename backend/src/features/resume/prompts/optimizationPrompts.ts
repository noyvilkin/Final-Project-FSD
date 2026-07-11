import type { ResumeOptimizationPayload } from '../types/resumeOptimization.types.js';
import { splitBullets } from '../utils/bulletText.js';

export const PROMPT_VERSION = 'v3' as const;
export const PROMPT_RELEASE_DATE = '2026-07-11';

export const SYSTEM_INSTRUCTION = `You are an expert ATS (Applicant Tracking System) resume optimizer (Prompt ${PROMPT_VERSION}, released ${PROMPT_RELEASE_DATE}).

Your role is to rewrite CV bullet points so they score higher in ATS keyword matching while remaining strictly truthful to the candidate's actual experience. Truthfulness always outranks keyword coverage — a lower ATS score is acceptable, a fabricated skill is never acceptable.

ABSOLUTE RULES:
1. GROUNDING FIRST: You may incorporate a JD keyword/phrase into a bullet ONLY when the candidate's ORIGINAL bullet text or Professional DNA already demonstrates that skill, tool, or experience. Use JD terminology only where it truthfully describes what the candidate actually did.
2. You MUST NOT invent new roles, job titles, dates, companies, or factual experiences.
3. You MUST NOT fabricate accomplishments, metrics, or outcomes the candidate did not demonstrate.
4. You MUST NOT insert skills, tools, technologies, certifications, or methodologies the candidate has not actually used. Keyword-stuffing with unearned skills — pulling any term from the JD into a bullet when it appears nowhere in the candidate's experience or skills — is a hallucination and is strictly forbidden, regardless of how relevant that term is to the role. A JD requirement the candidate lacks is a GAP; leave it out entirely, never fake it.
5. You CAN rephrase, restructure, and emphasize existing experience using JD terminology that the candidate genuinely supports.
6. You CAN add industry-standard action verbs (Led, Architected, Implemented, Optimized, etc.).
7. You MUST preserve the factual essence of each bullet — only improve phrasing and keyword alignment. Do not dilute, generalize, or bury the real accomplishment behind buzzwords.
8. Each rewritten bullet should be 1-2 lines, concise and impactful.
9. "keywordsUsed" MUST list ONLY keywords that are (a) drawn from the JD and (b) genuinely supported by the candidate's original bullet or DNA. If you cannot point to evidence for a keyword, do not put it in the bullet and do not list it. An empty list is correct when no JD keyword can be truthfully applied.
10. You MUST NOT use any Markdown formatting (no **bold**, no *italic*, no # headings) inside bullet text. Return clean plain text only.

Output contract:
- Return ONLY valid JSON — no markdown, no prose, no code fences.
- All string values must be plain text — no Markdown syntax whatsoever.
- Follow the exact schema specified in the user message.`;


export function buildOptimizationUserMessage(payload: ResumeOptimizationPayload): string {
  const { normalizedJD, extractedKeywords, professionalDNA, alignment } = payload;

  // Break every job's description into its individual bullet points so
  // each one is rewritten on its own — never as a single condensed
  // paragraph. `experienceIndex` ties each bullet back to its job.
  const experienceBullets = professionalDNA.experience.flatMap((exp, i) => {
    const bullets = splitBullets(exp.description || '');
    return bullets.map((bullet) => ({
      experienceIndex: i,
      company: exp.company,
      role: exp.role,
      bullet,
      extractedSkills: exp.extractedSkills,
    }));
  });

  return `## Job Description (Target)
"""
${normalizedJD.cleanText}
"""

## JD Keywords to Incorporate (ONLY where the candidate already supports them)
Hard Skills: ${extractedKeywords.hardSkills.join(', ') || 'None extracted'}
Tools: ${extractedKeywords.tools.join(', ') || 'None extracted'}
Certifications: ${extractedKeywords.certifications.join(', ') || 'None extracted'}
Methodologies: ${extractedKeywords.methodologies.join(', ') || 'None extracted'}

## Candidate's Current Skills (this is the ONLY evidence pool you may draw keywords from)
${professionalDNA.skillNames.join(', ') || 'No skills on file'}

## Alignment Status
Matching Skills (safe to emphasize): ${alignment.matchingSkills.join(', ') || 'None'}
Missing Skills (GAPS — DO NOT weave these into bullets or keywordsUsed; they are not part of the candidate's experience): ${alignment.missingSkills.join(', ') || 'None'}

## Experience Bullets to Optimize
Each item below is ONE individual bullet point. Treat and rewrite each bullet on its own — never merge several bullets into one, and never condense a whole job into a single line.
${JSON.stringify(experienceBullets, null, 2)}

## Required JSON Output
Return a JSON object with this exact schema:

{
  "optimizedBullets": [
    {
      "experienceIndex": <number — the experienceIndex of the bullet you rewrote, copied verbatim from the item above>,
      "originalBullet": "<the original bullet text, copied verbatim from the item above>",
      "optimizedBullet": "<rewritten version of that single bullet>",
      "explanation": "<1-2 sentences: why this change helps for ATS matching>",
      "confidenceScore": <number 0.0-1.0: how well the candidate's original data supports this rewrite>,
      "keywordsUsed": ["<JD keywords woven into this bullet>"]
    }
  ],
  "generalAdvice": "<1-2 sentences of overall resume strategy advice for this JD>"
}

Scoring guide for confidenceScore:
- 0.9-1.0: The candidate clearly has this skill/experience; rewrite is a safe rephrase.
- 0.7-0.89: Candidate likely has related experience; rewrite infers reasonable capability.
- 0.5-0.69: Weak evidence in DNA; the rewrite stretches but stays factual.
- Below 0.5: Very thin support — rewrite is borderline; user should verify.

Rules:
- Produce AT MOST one entry per input bullet, and rewrite each bullet independently.
- BE CONSERVATIVE AND SELECTIVE. Do NOT rewrite a bullet unless doing so incorporates at least one JD keyword/phrase that the original bullet does NOT already contain, and that the candidate genuinely supports. In other words, every suggestion you return MUST add real ATS keyword value.
- Purely cosmetic changes are FORBIDDEN as suggestions: do NOT return a rewrite whose only difference is reworded phrasing, reordered words, swapped synonyms, or a fancier action verb when no NEW JD keyword was added. Those are noise — OMIT them.
- If a bullet already covers its relevant JD keywords, or you would only be restyling it, OMIT it entirely. An empty "optimizedBullets" array is a valid and correct answer, and returning only 1-2 high-value rewrites is far better than rewriting every bullet.
- Do NOT return a rewrite that is identical (or trivially identical) to the original.
- "originalBullet" and "experienceIndex" MUST be copied exactly from the corresponding input item so each rewrite maps back to its source bullet.
- Do NOT invent experiences. Only rephrase using JD vocabulary the candidate genuinely supports.
- Every entry in "keywordsUsed" MUST be traceable to that bullet's original text or the candidate's skills above. Never list a keyword from the "Missing Skills (gaps)" section.
- It is better to leave "keywordsUsed" empty than to include a keyword the candidate cannot back up.`;
}


export function buildSemanticScoringUserMessage(
  dnaEssence: string,
  jdResponsibilities: string
): string {
  return `## Task
Compare the candidate's professional background against the job's core responsibilities and return a semantic similarity score.

## Candidate Professional Essence
"""
${dnaEssence}
"""

## Job Core Responsibilities
"""
${jdResponsibilities}
"""

## Required JSON Output
{
  "semanticScore": <number 0-100: how well the candidate's background aligns with these responsibilities>,
  "reasoning": "<2-3 sentences explaining the score>",
  "strongMatches": ["<responsibilities that align well with the candidate>"],
  "weakMatches": ["<responsibilities where the candidate has gaps>"]
}

Scoring guide:
- 90-100: Near-perfect alignment, candidate could step directly into this role.
- 70-89: Strong alignment with minor gaps.
- 50-69: Moderate alignment, significant upskilling needed.
- Below 50: Weak alignment, career pivot territory.`;
}

export const SEMANTIC_SCORING_SYSTEM_INSTRUCTION = `You are an expert recruiter and talent matcher (Prompt ${PROMPT_VERSION}, released ${PROMPT_RELEASE_DATE}).

Your role is to evaluate how well a candidate's professional background matches a job description's core responsibilities using semantic analysis — not just keyword matching.

Scoring principles:
- Score strictly on the candidate's demonstrated skills and experience relative to the responsibilities.
- Judge the SUBSTANCE of the experience, not its wording. Rephrasing that reflects the same underlying work must NOT change the score — only genuinely different capabilities should.
- Be deterministic and consistent: the same candidate/JD pairing must always receive the same score.

Output contract:
- Return ONLY valid JSON — no markdown, no prose, no code fences.
- Be honest and calibrated. Do not inflate scores.`;
