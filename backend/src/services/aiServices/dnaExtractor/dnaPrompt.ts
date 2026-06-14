import type { GeminiContent, GeminiPayload } from '../../../common/types/geminiTypes.js';

export const DNA_PROMPT_VERSION = 'v1' as const;

// ---------------------------------------------------------------------------
// Parameter types
// ---------------------------------------------------------------------------

export interface DnaMetadata {
  targetRole?:      string;
  currentRole?:     string;
  experienceHint?:  string;
}

export interface DnaPromptInput {
  resumeText: string;
  metadata:   DnaMetadata;
}

// ---------------------------------------------------------------------------
// System instruction
// ---------------------------------------------------------------------------

export function buildDnaSystemInstruction(): string {
  return `You are an expert resume parser — DNA Extractor ${DNA_PROMPT_VERSION}.

Your task: read the supplied resume text and return a single valid JSON object that captures the candidate's professional DNA.

RULES:
1. Skill names must use canonical casing.
   Examples: "React.js" not "React", "Node.js" not "node", "TypeScript" not "typescript",
   "PostgreSQL" not "postgres", "Next.js" not "NextJS".
2. Only include skills that are clearly stated in the resume or strongly implied by the described
   role and tech stack. Never invent or assume skills that are absent from the text.
3. Infer proficiencyLevel from context — years of experience, role seniority, and description depth:
   - expert:       5+ years, or explicit senior/lead/architect-level ownership
   - advanced:     3–5 years, or confident independent usage
   - intermediate: 1–3 years, or supporting-role usage
   - beginner:     < 1 year, or briefly mentioned without depth
4. Dates: if only a year is given (e.g. "2020"), use YYYY-01-01T00:00:00.000Z.
   If "Present" or "Current", set isCurrent to true and omit endDate.
5. achievements: short, concrete accomplishments the candidate explicitly highlights
   (awards, promotions, metrics, notable deliveries). Do not restate job duties here.
6. Return ONLY the JSON object — no markdown fences, no prose, no code blocks.`;
}

// ---------------------------------------------------------------------------
// User message
// ---------------------------------------------------------------------------

export function buildDnaUserMessage(input: DnaPromptInput): GeminiContent {
  const { resumeText, metadata } = input;

  const contextLines: string[] = [];
  if (metadata.targetRole)     contextLines.push(`Target role      : ${metadata.targetRole}`);
  if (metadata.currentRole)    contextLines.push(`Current/last role: ${metadata.currentRole}`);
  if (metadata.experienceHint) contextLines.push(`Experience hint  : ${metadata.experienceHint}`);

  const contextBlock = contextLines.length > 0
    ? `## Context\n${contextLines.join('\n')}\n\n`
    : '';

  const text = `${contextBlock}## Resume Text
"""
${resumeText}
"""

## Required JSON Output
Return ONLY this JSON object. No markdown, no explanation, no code fences.

{
  "skills": [
    {
      "name": "<canonical skill name, e.g. \\"React.js\\" not \\"React\\">",
      "category": "<technical | soft | tool | language>",
      "proficiencyLevel": "<beginner | intermediate | advanced | expert>",
      "yearsOfExperience": <number or omit if unknown>
    }
  ],
  "experience": [
    {
      "company": "<company name>",
      "role": "<job title>",
      "startDate": "<ISO date string, e.g. 2020-01-01T00:00:00.000Z>",
      "endDate": "<ISO date string or omit if isCurrent is true>",
      "isCurrent": <boolean>,
      "description": "<verbatim bullet points concatenated, or omit>",
      "extractedSkills": ["<skill names used in this role>"]
    }
  ],
  "education": [
    {
      "institution": "<school name>",
      "degree": "<degree type, e.g. B.Sc.>",
      "fieldOfStudy": "<major>",
      "startDate": "<ISO date string>",
      "endDate": "<ISO date string or omit>",
      "gpa": <number 0–4 or omit>
    }
  ],
  "achievements": [
    "<short concrete accomplishment explicitly stated by the candidate>"
  ]
}`;

  return { role: 'user', parts: [{ text }] };
}

// ---------------------------------------------------------------------------
// Payload builder
// ---------------------------------------------------------------------------

export function buildDnaPayload(input: DnaPromptInput): GeminiPayload {
  return {
    system_instruction: {
      parts: [{ text: buildDnaSystemInstruction() }],
    },
    contents: [buildDnaUserMessage(input)],
  };
}
