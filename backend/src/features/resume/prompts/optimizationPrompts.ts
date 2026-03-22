import type { ResumeOptimizationPayload } from '../types/resumeOptimization.types.js';

export const PROMPT_VERSION = 'v1' as const;
export const PROMPT_RELEASE_DATE = '2026-03-21';

export const SYSTEM_INSTRUCTION = `You are an expert ATS (Applicant Tracking System) resume optimizer (Prompt ${PROMPT_VERSION}, released ${PROMPT_RELEASE_DATE}).

Your role is to rewrite CV bullet points so they score higher in ATS keyword matching while remaining truthful to the candidate's actual experience.

ABSOLUTE RULES:
1. You MUST use keywords and phrases from the Job Description (JD) wherever they naturally fit.
2. You MUST NOT invent new roles, job titles, dates, companies, or factual experiences.
3. You MUST NOT fabricate accomplishments, metrics, or outcomes the candidate did not demonstrate.
4. You CAN rephrase, restructure, and emphasize existing experience using JD terminology.
5. You CAN add industry-standard action verbs (Led, Architected, Implemented, Optimized, etc.).
6. You MUST preserve the factual essence of each bullet — only improve phrasing and keyword alignment.
7. Each rewritten bullet should be 1-2 lines, concise and impactful.
8. You MUST NOT use any Markdown formatting (no **bold**, no *italic*, no # headings) inside bullet text. Return clean plain text only.

Output contract:
- Return ONLY valid JSON — no markdown, no prose, no code fences.
- All string values must be plain text — no Markdown syntax whatsoever.
- Follow the exact schema specified in the user message.`;


export function buildOptimizationUserMessage(payload: ResumeOptimizationPayload): string {
  const { normalizedJD, extractedKeywords, professionalDNA, alignment } = payload;

  const experienceBullets = professionalDNA.experience.map((exp, i) => ({
    index: i,
    company: exp.company,
    role: exp.role,
    startDate: exp.startDate,
    endDate: exp.endDate ?? 'Present',
    bullet: exp.description || `Worked as ${exp.role} at ${exp.company}`,
    extractedSkills: exp.extractedSkills,
  }));

  return `## Job Description (Target)
"""
${normalizedJD.cleanText}
"""

## JD Keywords to Incorporate
Hard Skills: ${extractedKeywords.hardSkills.join(', ') || 'None extracted'}
Tools: ${extractedKeywords.tools.join(', ') || 'None extracted'}
Certifications: ${extractedKeywords.certifications.join(', ') || 'None extracted'}
Methodologies: ${extractedKeywords.methodologies.join(', ') || 'None extracted'}

## Candidate's Current Skills
${professionalDNA.skillNames.join(', ') || 'No skills on file'}

## Alignment Status
Matching Skills: ${alignment.matchingSkills.join(', ') || 'None'}
Missing Skills (gaps): ${alignment.missingSkills.join(', ') || 'None'}

## Experience Bullets to Optimize
${JSON.stringify(experienceBullets, null, 2)}

## Required JSON Output
Return a JSON object with this exact schema:

{
  "optimizedBullets": [
    {
      "index": <number — matches the experience bullet index above>,
      "originalBullet": "<the original bullet text>",
      "optimizedBullet": "<rewritten bullet using JD keywords>",
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
- One entry per experience bullet provided above.
- If a bullet cannot be meaningfully improved, return it unchanged with confidenceScore: 1.0 and explanation: "Already well-optimized for ATS."
- Do NOT invent experiences. Only rephrase using JD vocabulary.`;
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

Output contract:
- Return ONLY valid JSON — no markdown, no prose, no code fences.
- Be honest and calibrated. Do not inflate scores.`;
