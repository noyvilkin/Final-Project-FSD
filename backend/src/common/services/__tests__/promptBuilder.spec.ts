import { PromptBuilder } from '../promptBuilder.js';
import type { PromptMetadata } from '../../types/promptTypes.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const BASE_METADATA: PromptMetadata = {
  recordId: 'rec-001',
  mediaType: 'audio',
  durationSeconds: 180,
  createdAt: '2025-06-01T10:00:00.000Z',
};

const TRANSCRIPT = 'I used React.js and Node.js to build a microservice architecture.';

// ---------------------------------------------------------------------------
// Constructor — version validation
// ---------------------------------------------------------------------------

describe('PromptBuilder — constructor', () => {
  it('defaults to v2', () => {
    const builder = new PromptBuilder();
    expect(builder.currentVersion).toBe('v2');
  });

  it('accepts v1', () => {
    const builder = new PromptBuilder('v1');
    expect(builder.currentVersion).toBe('v1');
  });

  it('accepts v2', () => {
    const builder = new PromptBuilder('v2');
    expect(builder.currentVersion).toBe('v2');
  });

  it('throws on unknown version', () => {
    expect(() => new PromptBuilder('v99' as any)).toThrow('Unknown prompt version');
  });

  it('exposes releaseDate', () => {
    const builder = new PromptBuilder('v1');
    expect(builder.releaseDate).toBe('2024-01-01');
  });
});

// ---------------------------------------------------------------------------
// buildPayload — structural contract
// ---------------------------------------------------------------------------

describe('PromptBuilder — buildPayload structure', () => {
  it('returns a GeminiPayload with system_instruction and contents', () => {
    const builder = new PromptBuilder();
    const payload = builder.buildPayload(TRANSCRIPT, BASE_METADATA);

    expect(payload).toHaveProperty('system_instruction');
    expect(payload).toHaveProperty('contents');
    expect(payload.system_instruction?.parts).toHaveLength(1);
    expect(payload.contents).toHaveLength(1);
  });

  it('system instruction contains the version string', () => {
    const builder = new PromptBuilder('v2');
    const payload = builder.buildPayload(TRANSCRIPT, BASE_METADATA);
    const text = payload.system_instruction!.parts[0].text;

    expect(text).toContain('Prompt v2');
  });

  it('contents[0] has role "user"', () => {
    const builder = new PromptBuilder();
    const payload = builder.buildPayload(TRANSCRIPT, BASE_METADATA);

    expect(payload.contents[0].role).toBe('user');
  });

  it('user message contains the transcript', () => {
    const builder = new PromptBuilder();
    const payload = builder.buildPayload(TRANSCRIPT, BASE_METADATA);
    const text = payload.contents[0].parts[0].text;

    expect(text).toContain(TRANSCRIPT);
  });
});

// ---------------------------------------------------------------------------
// V1 prompt content
// ---------------------------------------------------------------------------

describe('PromptBuilder — v1 prompt', () => {
  const builder = new PromptBuilder('v1');

  it('includes duration in seconds and minutes', () => {
    const payload = builder.buildPayload(TRANSCRIPT, BASE_METADATA);
    const text = payload.contents[0].parts[0].text;

    expect(text).toContain('180.0s');
    expect(text).toContain('3.00 min');
  });

  it('includes record ID and media type', () => {
    const payload = builder.buildPayload(TRANSCRIPT, BASE_METADATA);
    const text = payload.contents[0].parts[0].text;

    expect(text).toContain('rec-001');
    expect(text).toContain('audio');
  });

  it('requests overallScore and starAlignment in JSON output', () => {
    const payload = builder.buildPayload(TRANSCRIPT, BASE_METADATA);
    const text = payload.contents[0].parts[0].text;

    expect(text).toContain('overallScore');
    expect(text).toContain('starAlignment');
  });

  it('does NOT include skills/experience extraction (v1 did not have it)', () => {
    const payload = builder.buildPayload(TRANSCRIPT, BASE_METADATA);
    const text = payload.contents[0].parts[0].text;

    // V1 output schema has strengths/improvements but not skills[]
    expect(text).toContain('strengths');
    expect(text).not.toContain('"skills"');
  });
});

// ---------------------------------------------------------------------------
// V2 prompt content
// ---------------------------------------------------------------------------

describe('PromptBuilder — v2 prompt', () => {
  const builder = new PromptBuilder('v2');

  it('includes skills extraction in JSON output', () => {
    const payload = builder.buildPayload(TRANSCRIPT, BASE_METADATA);
    const text = payload.contents[0].parts[0].text;

    expect(text).toContain('"skills"');
    expect(text).toContain('"confidence"');
  });

  it('includes experience extraction in JSON output', () => {
    const payload = builder.buildPayload(TRANSCRIPT, BASE_METADATA);
    const text = payload.contents[0].parts[0].text;

    expect(text).toContain('"experience"');
    expect(text).toContain('"yearsHinted"');
  });

  it('mentions canonical casing rule', () => {
    const payload = builder.buildPayload(TRANSCRIPT, BASE_METADATA);
    const text = payload.contents[0].parts[0].text;

    expect(text).toContain('React.js');
    expect(text).toContain('Node.js');
  });

  it('includes createdAt timestamp', () => {
    const payload = builder.buildPayload(TRANSCRIPT, BASE_METADATA);
    const text = payload.contents[0].parts[0].text;

    expect(text).toContain('2025-06-01T10:00:00.000Z');
  });

  it('handles optional jobId when provided', () => {
    const metadata = { ...BASE_METADATA, jobId: 'job-42' };
    const payload = builder.buildPayload(TRANSCRIPT, metadata);
    const text = payload.contents[0].parts[0].text;

    expect(text).toContain('job-42');
  });

  it('shows "not provided" when jobId is absent', () => {
    const payload = builder.buildPayload(TRANSCRIPT, BASE_METADATA);
    const text = payload.contents[0].parts[0].text;

    expect(text).toContain('not provided');
  });
});

// ---------------------------------------------------------------------------
// System instruction — common rules
// ---------------------------------------------------------------------------

describe('PromptBuilder — system instruction', () => {
  it('mentions STAR method', () => {
    const builder = new PromptBuilder();
    const payload = builder.buildPayload(TRANSCRIPT, BASE_METADATA);
    const text = payload.system_instruction!.parts[0].text;

    expect(text).toContain('STAR');
  });

  it('instructs JSON-only output', () => {
    const builder = new PromptBuilder();
    const payload = builder.buildPayload(TRANSCRIPT, BASE_METADATA);
    const text = payload.system_instruction!.parts[0].text;

    expect(text.toLowerCase()).toMatch(/json/);
  });

  it('forbids inventing skills', () => {
    const builder = new PromptBuilder();
    const payload = builder.buildPayload(TRANSCRIPT, BASE_METADATA);
    const text = payload.system_instruction!.parts[0].text;

    expect(text.toLowerCase()).toContain('do not invent');
  });
});
