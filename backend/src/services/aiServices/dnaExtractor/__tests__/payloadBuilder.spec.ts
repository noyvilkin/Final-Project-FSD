import { extractDna, estimateTokens } from '../payloadBuilder.js';
import type { GeminiClient } from '../../../../common/services/geminiClient.js';
import type { GeminiPayload } from '../../../../common/types/geminiTypes.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDnaJson(skills: object[]): string {
  return JSON.stringify({
    skills,
    experience: [],
    education:  [],
    achievements: [],
  });
}

function makeClient(response: string): GeminiClient {
  return { generate: jest.fn().mockResolvedValue(response) } as unknown as GeminiClient;
}

function capturedPayload(client: GeminiClient): GeminiPayload {
  return (client.generate as jest.Mock).mock.calls[0][0] as GeminiPayload;
}

function capturedResumeText(client: GeminiClient): string {
  const payload = capturedPayload(client);
  return payload.contents[0].parts[0].text;
}

const METADATA = {};

// ---------------------------------------------------------------------------
// estimateTokens
// ---------------------------------------------------------------------------

describe('estimateTokens', () => {
  it('returns 1 for 1–4 chars', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('a')).toBe(1);
  });

  it('rounds up (ceil)', () => {
    expect(estimateTokens('abcde')).toBe(2); // 5/4 = 1.25 → 2
  });

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Under-budget: resume passes through unchanged
// ---------------------------------------------------------------------------

describe('extractDna — under-budget', () => {
  const shortResume = 'Senior TypeScript engineer, 5 years experience.';

  beforeEach(() => {
    process.env['GEMINI_MAX_INPUT_TOKENS'] = '8000';
  });

  afterEach(() => {
    delete process.env['GEMINI_MAX_INPUT_TOKENS'];
  });

  it('does not truncate a short resume', async () => {
    const client = makeClient(
      makeDnaJson([{ name: 'TypeScript', category: 'technical', proficiencyLevel: 'expert' }]),
    );
    await extractDna({ client, resumeText: shortResume, metadata: METADATA });
    expect(capturedResumeText(client)).toContain(shortResume);
    expect(capturedResumeText(client)).not.toContain('...[truncated]');
  });

  it('returns a DnaResult with skills', async () => {
    const client = makeClient(
      makeDnaJson([{ name: 'TypeScript', category: 'technical', proficiencyLevel: 'expert' }]),
    );
    const result = await extractDna({ client, resumeText: shortResume, metadata: METADATA });
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].name).toBe('TypeScript');
  });
});

// ---------------------------------------------------------------------------
// Over-budget: resume is truncated from the bottom
// ---------------------------------------------------------------------------

describe('extractDna — over-budget truncation', () => {
  // budget = 10 tokens → 40 chars; suffix '...[truncated]' = 14 chars
  // so max resume chars = 40 - 14 = 26
  const LIMIT = '10';
  const longResume = 'x'.repeat(200);

  beforeEach(() => {
    process.env['GEMINI_MAX_INPUT_TOKENS'] = LIMIT;
  });

  afterEach(() => {
    delete process.env['GEMINI_MAX_INPUT_TOKENS'];
  });

  it('appends "...[truncated]" to the resume in the payload', async () => {
    const client = makeClient(makeDnaJson([]));
    await extractDna({ client, resumeText: longResume, metadata: METADATA });
    expect(capturedResumeText(client)).toContain('...[truncated]');
  });

  it('keeps the truncated text within the token budget', async () => {
    const client = makeClient(makeDnaJson([]));
    await extractDna({ client, resumeText: longResume, metadata: METADATA });

    const userText   = capturedResumeText(client);
    const resumeLine = userText.split('\n').find(l => l.includes('...[truncated]')) ?? '';
    // The truncated resume chunk must have ≤ 10 * 4 = 40 chars
    const resumeChunk = resumeLine.trim();
    expect(resumeChunk.length).toBeLessThanOrEqual(40);
  });
});

// ---------------------------------------------------------------------------
// SkillNormalizer wires through
// ---------------------------------------------------------------------------

describe('extractDna — normalizer', () => {
  beforeEach(() => {
    delete process.env['GEMINI_MAX_INPUT_TOKENS'];
  });

  it('normalises "react" → "React.js"', async () => {
    const client = makeClient(
      makeDnaJson([{ name: 'react', category: 'technical', proficiencyLevel: 'advanced' }]),
    );
    const result = await extractDna({ client, resumeText: 'React dev', metadata: METADATA });
    expect(result.skills[0].name).toBe('React.js');
  });

  it('normalises "node" → "Node.js"', async () => {
    const client = makeClient(
      makeDnaJson([{ name: 'node', category: 'technical', proficiencyLevel: 'intermediate' }]),
    );
    const result = await extractDna({ client, resumeText: 'Node dev', metadata: METADATA });
    expect(result.skills[0].name).toBe('Node.js');
  });

  it('normalises "postgres" → "PostgreSQL"', async () => {
    const client = makeClient(
      makeDnaJson([{ name: 'postgres', category: 'tool', proficiencyLevel: 'advanced' }]),
    );
    const result = await extractDna({ client, resumeText: 'DB dev', metadata: METADATA });
    expect(result.skills[0].name).toBe('PostgreSQL');
  });
});

// ---------------------------------------------------------------------------
// Proficiency dedup picks the higher level
// ---------------------------------------------------------------------------

describe('extractDna — proficiency dedup', () => {
  beforeEach(() => {
    delete process.env['GEMINI_MAX_INPUT_TOKENS'];
  });

  it('keeps "advanced" over "beginner" for the same canonical skill', async () => {
    const client = makeClient(
      makeDnaJson([
        { name: 'react',   category: 'technical', proficiencyLevel: 'beginner'  },
        { name: 'React.js',category: 'technical', proficiencyLevel: 'advanced'  },
      ]),
    );
    const result = await extractDna({ client, resumeText: 'React dev', metadata: METADATA });
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].name).toBe('React.js');
    expect(result.skills[0].proficiencyLevel).toBe('advanced');
  });

  it('keeps "expert" over "intermediate"', async () => {
    const client = makeClient(
      makeDnaJson([
        { name: 'typescript',  category: 'technical', proficiencyLevel: 'intermediate' },
        { name: 'TypeScript',  category: 'technical', proficiencyLevel: 'expert'       },
      ]),
    );
    const result = await extractDna({ client, resumeText: 'TS dev', metadata: METADATA });
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].proficiencyLevel).toBe('expert');
  });

  it('keeps the first entry when both have the same proficiency', async () => {
    const client = makeClient(
      makeDnaJson([
        { name: 'node',    category: 'technical', proficiencyLevel: 'advanced' },
        { name: 'Node.js', category: 'technical', proficiencyLevel: 'advanced' },
      ]),
    );
    const result = await extractDna({ client, resumeText: 'Node dev', metadata: METADATA });
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].name).toBe('Node.js');
  });

  it('preserves distinct skills after dedup', async () => {
    const client = makeClient(
      makeDnaJson([
        { name: 'react',      category: 'technical', proficiencyLevel: 'advanced' },
        { name: 'typescript', category: 'technical', proficiencyLevel: 'expert'   },
      ]),
    );
    const result = await extractDna({ client, resumeText: 'FS dev', metadata: METADATA });
    expect(result.skills).toHaveLength(2);
    const names = result.skills.map(s => s.name);
    expect(names).toContain('React.js');
    expect(names).toContain('TypeScript');
  });
});
