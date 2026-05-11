import { GeminiClient } from '../../../common/services/geminiClient.js';
import { buildDnaPayload } from './dnaPrompt.js';
import type { DnaMetadata } from './dnaPrompt.js';
import { parseDna } from './dnaSchema.js';
import type { DnaResult } from './dnaSchema.js';
import { SkillNormalizer } from '../skillNormalizer.js';

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

export function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TRUNCATION_SUFFIX = '...[truncated]';

type ProficiencyLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

const PROFICIENCY_RANK: Record<ProficiencyLevel, number> = {
  beginner:     0,
  intermediate: 1,
  advanced:     2,
  expert:       3,
};

function truncateToTokenBudget(text: string, maxTokens: number): string {
  if (estimateTokens(text) <= maxTokens) return text;
  const maxChars = maxTokens * 4 - TRUNCATION_SUFFIX.length;
  return text.slice(0, maxChars) + TRUNCATION_SUFFIX;
}

function normalizeAndDedup(
  skills: DnaResult['skills'],
  normalizer: SkillNormalizer,
): DnaResult['skills'] {
  const map = new Map<string, DnaResult['skills'][number]>();

  for (const skill of skills) {
    const canonical = normalizer.normalize(skill.name);
    const existing = map.get(canonical);
    if (
      !existing ||
      PROFICIENCY_RANK[skill.proficiencyLevel] > PROFICIENCY_RANK[existing.proficiencyLevel]
    ) {
      map.set(canonical, { ...skill, name: canonical });
    }
  }

  return Array.from(map.values());
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ExtractDnaParams {
  client:     GeminiClient;
  resumeText: string;
  metadata:   DnaMetadata;
}

export async function extractDna(params: ExtractDnaParams): Promise<DnaResult> {
  const { client, resumeText, metadata } = params;

  const envVal = parseInt(process.env['GEMINI_MAX_INPUT_TOKENS'] ?? '', 10);
  const budget = isNaN(envVal) ? 8_000 : envVal;

  const text    = truncateToTokenBudget(resumeText, budget);
  const payload = buildDnaPayload({ resumeText: text, metadata });
  const raw     = await client.generate(payload);
  const result  = parseDna(raw);

  const normalizer = new SkillNormalizer();
  return { ...result, skills: normalizeAndDedup(result.skills, normalizer) };
}
