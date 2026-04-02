import { AIAnalysisService } from '../services/aiAnalysisService.js';

describe('AIAnalysisService.parseAIResponse', () => {
  it('parses valid plain JSON responses', () => {
    const rawResponse = JSON.stringify({
      codeQuality: { score: 72, strengths: ['Readable'], weaknesses: ['Few comments'] },
      functionalCorrectness: { score: 68, meetsRequirements: false, missingFeatures: ['Validation'] },
      bestPractices: { score: 70, followsConventions: true, suggestions: ['Improve tests'] },
      overall: { score: 70, grade: 'C', summary: 'Acceptable but incomplete' },
    });

    const feedback = AIAnalysisService.parseAIResponse(rawResponse);

    expect(feedback?.overall.score).toBe(70);
    expect(feedback?.functionalCorrectness.missingFeatures).toEqual(['Validation']);
  });

  it('parses markdown-wrapped JSON and coerces values', () => {
    const rawResponse = '```json\n' +
      '{\n' +
      '  "codeQuality": { "score": "91", "strengths": ["Clean structure"], "weaknesses": [] },\n' +
      '  "functionalCorrectness": { "score": 88, "meetsRequirements": true, "missingFeatures": [] },\n' +
      '  "bestPractices": { "score": "76", "followsConventions": true, "suggestions": ["Add tests"] },\n' +
      '  "overall": { "score": "85", "grade": "B", "summary": "Solid submission" }\n' +
      '}\n' +
      '```';

    const feedback = AIAnalysisService.parseAIResponse(rawResponse);

    expect(feedback?.overall.score).toBe(85);
    expect(feedback?.codeQuality.score).toBe(91);
    expect(feedback?.bestPractices.suggestions).toEqual(['Add tests']);
  });

  it('applies safe defaults when fields are missing', () => {
    const rawResponse = JSON.stringify({
      codeQuality: { score: 64 },
      functionalCorrectness: {},
      overall: { grade: 'D' },
    });

    const feedback = AIAnalysisService.parseAIResponse(rawResponse);

    expect(feedback?.codeQuality.score).toBe(64);
    expect(feedback?.codeQuality.strengths).toEqual([]);
    expect(feedback?.functionalCorrectness.score).toBe(0);
    expect(feedback?.bestPractices.suggestions).toEqual([]);
    expect(feedback?.overall.summary).toBe('No summary provided');
  });

  it('falls back safely for malformed JSON', () => {
    const feedback = AIAnalysisService.parseAIResponse('not valid json');

    expect(feedback?.overall.score).toBe(0);
    expect(feedback?.overall.summary).toContain('failed');
  });
});
