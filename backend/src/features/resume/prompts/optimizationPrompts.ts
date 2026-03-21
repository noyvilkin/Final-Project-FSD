import type { OptimizationPayload } from '../types/optimization.types.js';
import type { GeminiPayload } from '../../../common/services/geminiClient.js';

export type OptimizationPromptVersion = 'v1';

interface VersionMeta {
  releaseDate: string;
  description: string;
}

const PROMPT_VERSIONS: Record<OptimizationPromptVersion, VersionMeta> = {
  v1: {
    releaseDate: '2026-03-21',
    description: 'Initial CV bullet optimization with ATS focus',
  },
};

const DEFAULT_VERSION: OptimizationPromptVersion = 'v1';

const SYSTEM_INSTRUCTION = (version: OptimizationPromptVersion): string => `\
You are a senior career coach and ATS (Applicant Tracking System) optimization expert \
(Prompt version: ${version}, released ${PROMPT_VERSIONS[version].releaseDate}).

Your task is to rewrite CV/resume bullet points so they score higher on ATS systems \
for a specific job description.

STRICT RULES — VIOLATION OF ANY RULE INVALIDATES THE OUTPUT:
1. You MUST incorporate relevant keywords from the Job Description naturally.
2. You MUST NOT invent new roles, job titles, dates, companies, or factual experiences.
3. You MUST preserve the candidate's original meaning and accomplishments.
4. You SHOULD quantify impact where the original data supports it.
5. You SHOULD use strong action verbs that align with the target role.
6. Each rewritten bullet MUST be a single sentence, 15-30 words long.
7. Return ONLY valid JSON — no markdown, no explanation outside the JSON structure.`;

function buildUserPrompt(payload: OptimizationPayload): string {
  const { jobDescription, bulletsToOptimize, skills } = payload;

  const jdSection = `## Target Job Description
Title: ${jobDescription.title}
${jobDescription.company ? `Company: ${jobDescription.company}` : ''}

Description:
${jobDescription.description}

Required Skills: ${jobDescription.requiredSkills.join(', ')}
${jobDescription.preferredSkills?.length ? `Preferred Skills: ${jobDescription.preferredSkills.join(', ')}` : ''}

Core Responsibilities:
${jobDescription.coreResponsibilities.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;

  const candidateSkillsSection = `## Candidate's Verified Skills
${skills.map(s => `- ${s.name} (${s.category}, ${s.proficiencyLevel})`).join('\n')}`;

  const bulletsSection = `## Bullets to Optimize
${bulletsToOptimize.map(b => `### Experience Index ${b.experienceIndex} — ${b.role} at ${b.company}
Original: "${b.originalBullet}"`).join('\n\n')}`;

  const outputSchema = `## Required JSON Output
Return ONLY this JSON structure:
{
  "optimizedBullets": [
    {
      "experienceIndex": <number — must match the input>,
      "originalBullet": "<exact original text>",
      "optimizedBullet": "<your rewritten bullet>",
      "explanation": "<1-2 sentences: why this rewrite improves ATS match>",
      "confidenceScore": <0.0-1.0: how well the candidate's original data supports this rewrite>,
      "keywordsUsed": ["<JD keywords naturally woven in>"]
    }
  ],
  "overallNotes": "<brief summary of optimization strategy>"
}

Confidence Score Guidelines:
- 0.9-1.0: Original bullet already supports the rewrite with strong evidence
- 0.7-0.89: Good supporting evidence, minor inference used
- 0.5-0.69: Moderate inference, the rewrite stretches the original somewhat
- Below 0.5: Significant inference — flag as risky rewrite`;

  return [jdSection, candidateSkillsSection, bulletsSection, outputSchema].join('\n\n');
}

const SEMANTIC_SCORING_SYSTEM = `\
You are an expert at evaluating how well a candidate's professional profile matches \
a job description. Analyze the semantic alignment between the candidate's experience \
and the job's core responsibilities.

Return ONLY valid JSON — no markdown, no extra text.`;

function buildSemanticScoringPrompt(
  dnaEssence: string,
  responsibilities: string[],
): string {
  return `## Candidate Professional Essence
${dnaEssence}

## Job Core Responsibilities
${responsibilities.map((r, i) => `${i + 1}. ${r}`).join('\n')}

## Required JSON Output
{
  "semanticScore": <integer 0-100, overall alignment>,
  "topMatchingAreas": ["<responsibilities that align well>"],
  "weakAreas": ["<responsibilities with poor or no alignment>"]
}`;
}

export class OptimizationPromptBuilder {
  private readonly version: OptimizationPromptVersion;

  constructor(version: OptimizationPromptVersion = DEFAULT_VERSION) {
    if (!PROMPT_VERSIONS[version]) {
      throw new Error(
        `Unknown prompt version: ${version}. Valid: ${Object.keys(PROMPT_VERSIONS).join(', ')}`,
      );
    }
    this.version = version;
  }

  get currentVersion(): OptimizationPromptVersion { return this.version; }
  get releaseDate(): string { return PROMPT_VERSIONS[this.version].releaseDate; }

  buildOptimizationPayload(payload: OptimizationPayload): GeminiPayload {
    return {
      system_instruction: {
        parts: [{ text: SYSTEM_INSTRUCTION(this.version) }],
      },
      contents: [{
        role: 'user',
        parts: [{ text: buildUserPrompt(payload) }],
      }],
    };
  }

  buildSemanticScoringPayload(
    dnaEssence: string,
    responsibilities: string[],
  ): GeminiPayload {
    return {
      system_instruction: {
        parts: [{ text: SEMANTIC_SCORING_SYSTEM }],
      },
      contents: [{
        role: 'user',
        parts: [{ text: buildSemanticScoringPrompt(dnaEssence, responsibilities) }],
      }],
    };
  }
}
