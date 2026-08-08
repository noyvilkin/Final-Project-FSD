/**
 * Unit tests for LLMInsightsService.parseAndValidate
 * Pure parsing — no network, no DB, no mocks needed.
 */

process.env.S3_ENDPOINT         = 'http://localhost:9000';
process.env.S3_ACCESS_KEY_ID    = 'test';
process.env.S3_SECRET_ACCESS_KEY = 'test';
process.env.S3_BUCKET_NAME      = 'test';
process.env.COLMAN_LLM_USERNAME = 'test-user';
process.env.COLMAN_LLM_PASSWORD = 'test-pass';

import {
  LLMInsightsService,
  LLMInsightsParseError,
} from '../../features/interview/services/llmInsightsService.js';

// ─── Fixture ──────────────────────────────────────────────────────────────────

const VALID_LLM_JSON = JSON.stringify({
  starAnalysis: {
    situation: { text: 'At my last job', start: 0,    end: 5,  score: 80, feedback: 'Good context' },
    task:      { text: 'I had to lead',  start: 5,    end: 10, score: 75, feedback: 'Clear task'   },
    action:    {
      text:                     'I designed the architecture',
      start:                    10,
      end:                      30,
      score:                    85,
      feedback:                 'Strong personal ownership',
      candidateOwnedAction:     true,
      teamOnlyLanguageDetected: false,
    },
    result: { text: '30% improvement', start: 30, end: 40, score: 90, feedback: 'Quantified well' },
  },
  candidateActionAssessment: {
    candidateOwnedActionScore: 85,
    usesPersonalAgency:        true,
    teamLanguageDetected:      false,
    feedback:                  'Candidate clearly owns their actions.',
  },
  confidenceScore:  78,
  strengths:        ['Clear structure', 'Quantified results'],
  weaknesses:       ['Could be more concise'],
  recommendations:  ['Add more specific metrics'],
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LLMInsightsService.parseAndValidate', () => {
  it('parses a valid LLM JSON response correctly', () => {
    const result = LLMInsightsService.parseAndValidate(VALID_LLM_JSON);

    expect(result.starAnalysis.situation.score).toBe(80);
    expect(result.starAnalysis.action.candidateOwnedAction).toBe(true);
    expect(result.starAnalysis.action.teamOnlyLanguageDetected).toBe(false);
    expect(result.candidateActionAssessment.candidateOwnedActionScore).toBe(85);
    expect(result.candidateActionAssessment.usesPersonalAgency).toBe(true);
    expect(result.confidenceScore).toBe(78);
    expect(result.strengths).toHaveLength(2);
    expect(result.weaknesses).toHaveLength(1);
    expect(result.recommendations).toHaveLength(1);
  });

  it('strips markdown code fences before parsing', () => {
    const withFences = '```json\n' + VALID_LLM_JSON + '\n```';
    expect(() => LLMInsightsService.parseAndValidate(withFences)).not.toThrow();
  });

  it('throws LLMInsightsParseError for invalid JSON', () => {
    expect(() => LLMInsightsService.parseAndValidate('not json at all'))
      .toThrow(LLMInsightsParseError);
  });

  it('throws LLMInsightsParseError when starAnalysis is missing', () => {
    const noStar = JSON.stringify({
      confidenceScore: 50,
      strengths: [],
      weaknesses: [],
      recommendations: [],
    });
    expect(() => LLMInsightsService.parseAndValidate(noStar))
      .toThrow(LLMInsightsParseError);
  });

  it('clamps confidenceScore to 0–100', () => {
    const overScore = JSON.parse(VALID_LLM_JSON);
    overScore.confidenceScore = 150;
    const result = LLMInsightsService.parseAndValidate(JSON.stringify(overScore));
    expect(result.confidenceScore).toBe(100);
  });

  it('returns empty arrays when strengths/weaknesses/recommendations are missing', () => {
    const parsed = JSON.parse(VALID_LLM_JSON);
    delete parsed.strengths;
    delete parsed.weaknesses;
    delete parsed.recommendations;
    const result = LLMInsightsService.parseAndValidate(JSON.stringify(parsed));
    expect(result.strengths).toEqual([]);
    expect(result.weaknesses).toEqual([]);
    expect(result.recommendations).toEqual([]);
  });

  it('saves candidateOwnedAction = false and teamOnlyLanguageDetected = true', () => {
    const teamFocused = JSON.parse(VALID_LLM_JSON);
    teamFocused.starAnalysis.action.candidateOwnedAction     = false;
    teamFocused.starAnalysis.action.teamOnlyLanguageDetected = true;
    const result = LLMInsightsService.parseAndValidate(JSON.stringify(teamFocused));
    expect(result.starAnalysis.action.candidateOwnedAction).toBe(false);
    expect(result.starAnalysis.action.teamOnlyLanguageDetected).toBe(true);
  });

  it('handles null start/end timestamps from the LLM', () => {
    const withNulls = JSON.parse(VALID_LLM_JSON);
    withNulls.starAnalysis.situation.start = null;
    withNulls.starAnalysis.situation.end   = null;
    const result = LLMInsightsService.parseAndValidate(JSON.stringify(withNulls));
    expect(result.starAnalysis.situation.start).toBeNull();
    expect(result.starAnalysis.situation.end).toBeNull();
  });

  it('defaults missing action fields to safe values', () => {
    const minimal = JSON.parse(VALID_LLM_JSON);
    minimal.starAnalysis.action = {}; // completely empty
    const result = LLMInsightsService.parseAndValidate(JSON.stringify(minimal));
    expect(result.starAnalysis.action.candidateOwnedAction).toBe(false);
    expect(result.starAnalysis.action.teamOnlyLanguageDetected).toBe(false);
    expect(result.starAnalysis.action.score).toBe(0);
    expect(result.starAnalysis.action.text).toBe('');
  });
});
