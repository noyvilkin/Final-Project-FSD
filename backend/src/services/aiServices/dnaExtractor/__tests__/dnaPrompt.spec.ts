import {
  DNA_PROMPT_VERSION,
  buildDnaSystemInstruction,
  buildDnaUserMessage,
  buildDnaPayload,
} from '../dnaPrompt.js';
import type { GeminiPayload } from '../../../../common/types/geminiTypes.js';

const RESUME = 'John Doe — Senior TypeScript Engineer at Acme Corp (2020–present).';
const BASE_INPUT = { resumeText: RESUME, metadata: {} };

// ---------------------------------------------------------------------------
// buildDnaPayload — structural contract
// ---------------------------------------------------------------------------

describe('buildDnaPayload — structure', () => {
  let payload: GeminiPayload;

  beforeEach(() => {
    payload = buildDnaPayload(BASE_INPUT);
  });

  it('has a system_instruction key', () => {
    expect(payload).toHaveProperty('system_instruction');
  });

  it('system_instruction.parts is a non-empty array', () => {
    expect(Array.isArray(payload.system_instruction?.parts)).toBe(true);
    expect(payload.system_instruction!.parts.length).toBeGreaterThan(0);
  });

  it('system_instruction.parts[0].text is a non-empty string', () => {
    const text = payload.system_instruction!.parts[0].text;
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
  });

  it('has a contents array with exactly one entry', () => {
    expect(Array.isArray(payload.contents)).toBe(true);
    expect(payload.contents).toHaveLength(1);
  });

  it('contents[0].role is "user"', () => {
    expect(payload.contents[0].role).toBe('user');
  });

  it('contents[0].parts[0].text contains the resume text', () => {
    const text = payload.contents[0].parts[0].text;
    expect(text).toContain(RESUME);
  });
});

// ---------------------------------------------------------------------------
// buildDnaSystemInstruction — prompt rules
// ---------------------------------------------------------------------------

describe('buildDnaSystemInstruction', () => {
  let instruction: string;

  beforeEach(() => {
    instruction = buildDnaSystemInstruction();
  });

  it('stamps the prompt version', () => {
    expect(instruction).toContain(DNA_PROMPT_VERSION);
  });

  it('contains the canonical casing example "React.js"', () => {
    expect(instruction).toContain('React.js');
  });

  it('prohibits fences/prose in output', () => {
    expect(instruction.toLowerCase()).toMatch(/no markdown|no.*fence|no prose/);
  });

  it('references proficiencyLevel inference rules', () => {
    expect(instruction).toContain('proficiencyLevel');
  });
});

// ---------------------------------------------------------------------------
// buildDnaUserMessage — metadata injection
// ---------------------------------------------------------------------------

describe('buildDnaUserMessage — metadata', () => {
  it('omits Context block when metadata is empty', () => {
    const msg = buildDnaUserMessage(BASE_INPUT);
    expect(msg.parts[0].text).not.toContain('## Context');
  });

  it('includes targetRole in Context block when provided', () => {
    const msg = buildDnaUserMessage({
      resumeText: RESUME,
      metadata: { targetRole: 'Staff Engineer' },
    });
    expect(msg.parts[0].text).toContain('## Context');
    expect(msg.parts[0].text).toContain('Staff Engineer');
  });

  it('includes currentRole and experienceHint when provided', () => {
    const msg = buildDnaUserMessage({
      resumeText: RESUME,
      metadata: { currentRole: 'Senior Dev', experienceHint: '8 years total' },
    });
    const text = msg.parts[0].text;
    expect(text).toContain('Senior Dev');
    expect(text).toContain('8 years total');
  });

  it('includes all three metadata fields when all are supplied', () => {
    const msg = buildDnaUserMessage({
      resumeText: RESUME,
      metadata: {
        targetRole:     'Principal Engineer',
        currentRole:    'Senior Engineer',
        experienceHint: '10+ years',
      },
    });
    const text = msg.parts[0].text;
    expect(text).toContain('Principal Engineer');
    expect(text).toContain('Senior Engineer');
    expect(text).toContain('10+ years');
  });

  it('always embeds the resume text in parts[0].text', () => {
    const msg = buildDnaUserMessage({
      resumeText: RESUME,
      metadata: { targetRole: 'CTO' },
    });
    expect(msg.parts[0].text).toContain(RESUME);
  });

  it('returns role "user"', () => {
    const msg = buildDnaUserMessage(BASE_INPUT);
    expect(msg.role).toBe('user');
  });
});
