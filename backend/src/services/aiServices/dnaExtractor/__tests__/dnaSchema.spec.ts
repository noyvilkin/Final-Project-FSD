import { parseDna, DnaSchema, DnaResult } from '../dnaSchema.js';

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------

const VALID: DnaResult = {
  skills: [
    { name: 'TypeScript', category: 'technical', proficiencyLevel: 'advanced', yearsOfExperience: 3 },
    { name: 'Communication', category: 'soft', proficiencyLevel: 'expert' },
  ],
  experience: [
    {
      company: 'Acme Corp',
      role: 'Senior Engineer',
      startDate: new Date('2021-01-01'),
      endDate: new Date('2023-06-30'),
      isCurrent: false,
      description: 'Built scalable APIs.',
      extractedSkills: ['TypeScript', 'Node.js'],
    },
    {
      company: 'Startup Inc',
      role: 'Lead Developer',
      startDate: new Date('2023-07-01'),
      isCurrent: true,
      extractedSkills: [],
    },
  ],
  education: [
    {
      institution: 'State University',
      degree: 'B.Sc.',
      fieldOfStudy: 'Computer Science',
      startDate: new Date('2016-09-01'),
      endDate: new Date('2020-05-15'),
      gpa: 3.8,
    },
  ],
  achievements: ['Top performer Q1 2022', 'Open-source contributor'],
};

// JSON representation (dates as strings, as the AI would return)
const VALID_JSON = JSON.stringify({
  ...VALID,
  experience: VALID.experience.map((e) => ({
    ...e,
    startDate: e.startDate.toISOString(),
    endDate: e.endDate?.toISOString(),
  })),
  education: VALID.education.map((e) => ({
    ...e,
    startDate: e.startDate.toISOString(),
    endDate: e.endDate?.toISOString(),
  })),
});

// ---------------------------------------------------------------------------
// parseDna — valid input
// ---------------------------------------------------------------------------

describe('parseDna — valid input', () => {
  it('parses a plain JSON string and returns typed data', () => {
    const result = parseDna(VALID_JSON);
    expect(result.skills).toHaveLength(2);
    expect(result.skills[0].name).toBe('TypeScript');
    expect(result.experience[0].startDate).toBeInstanceOf(Date);
    expect(result.education[0].gpa).toBe(3.8);
    expect(result.achievements).toEqual(['Top performer Q1 2022', 'Open-source contributor']);
  });

  it('coerces date strings to Date objects', () => {
    const result = parseDna(VALID_JSON);
    expect(result.experience[0].endDate).toBeInstanceOf(Date);
    expect(result.education[0].endDate).toBeInstanceOf(Date);
  });

  it('applies isCurrent default (false) when omitted', () => {
    const data = { ...VALID, experience: [{ company: 'X', role: 'Dev', startDate: '2020-01-01', extractedSkills: [] }] };
    const result = parseDna(JSON.stringify(data));
    expect(result.experience[0].isCurrent).toBe(false);
  });

  it('applies extractedSkills default ([]) when omitted', () => {
    const data = { ...VALID, experience: [{ company: 'X', role: 'Dev', startDate: '2020-01-01' }] };
    const result = parseDna(JSON.stringify(data));
    expect(result.experience[0].extractedSkills).toEqual([]);
  });

  it('strips ```json fences', () => {
    const result = parseDna('```json\n' + VALID_JSON + '\n```');
    expect(result.skills).toHaveLength(2);
  });

  it('strips plain ``` fences', () => {
    const result = parseDna('```\n' + VALID_JSON + '\n```');
    expect(result.experience).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// parseDna — malformed JSON
// ---------------------------------------------------------------------------

describe('parseDna — malformed JSON', () => {
  it('throws "Invalid JSON" with SyntaxError detail on truncated input', () => {
    expect(() => parseDna('{ "skills": [')).toThrow(/Invalid JSON —/);
  });

  it('includes position info surfaced by the JS engine', () => {
    let err: Error | undefined;
    try { parseDna('{bad json}'); } catch (e) { err = e as Error; }
    expect(err).toBeDefined();
    expect(err!.message).toMatch(/Invalid JSON —/);
    // Node's SyntaxError message includes a position description
    expect(err!.message.length).toBeGreaterThan('Invalid JSON — '.length);
  });
});

// ---------------------------------------------------------------------------
// parseDna — schema violations
// ---------------------------------------------------------------------------

describe('parseDna — schema violations', () => {
  it('throws with field path when category enum is invalid', () => {
    const bad = { ...VALID, skills: [{ name: 'Go', category: 'WRONG', proficiencyLevel: 'advanced' }] };
    expect(() => parseDna(JSON.stringify(bad))).toThrow(/skills\.0\.category/);
  });

  it('throws with field path when proficiencyLevel is missing', () => {
    const bad = { ...VALID, skills: [{ name: 'Go', category: 'technical' }] };
    expect(() => parseDna(JSON.stringify(bad))).toThrow(/skills\.0\.proficiencyLevel/);
  });

  it('throws with field path when gpa exceeds 4', () => {
    const bad = { ...VALID, education: [{ ...VALID.education[0], gpa: 5 }] };
    expect(() => parseDna(JSON.stringify(bad))).toThrow(/education\.0\.gpa/);
  });

  it('throws with field path when required top-level key is absent', () => {
    const bad = { skills: VALID.skills, experience: VALID.experience, education: VALID.education };
    expect(() => parseDna(JSON.stringify(bad))).toThrow(/DNA validation failed/);
  });

  it('error message contains the field path, not just a generic string', () => {
    const bad = { ...VALID, experience: [{ company: 'X' }] };
    let err: Error | undefined;
    try { parseDna(JSON.stringify(bad)); } catch (e) { err = e as Error; }
    expect(err!.message).toMatch(/experience\.0\./);
  });
});

// ---------------------------------------------------------------------------
// DnaSchema.parse (direct zod API)
// ---------------------------------------------------------------------------

describe('DnaSchema.parse', () => {
  it('returns typed data for a valid object', () => {
    const result = DnaSchema.parse(VALID);
    expect(result.skills[1].yearsOfExperience).toBeUndefined();
  });
});
