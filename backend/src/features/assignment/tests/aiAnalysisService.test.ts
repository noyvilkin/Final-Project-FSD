import { AIAnalysisService } from '../services/aiAnalysisService.js';

describe('AIAnalysisService.parseAIResponse', () => {
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

  it('falls back safely for malformed JSON', () => {
    const feedback = AIAnalysisService.parseAIResponse('not valid json');

    expect(feedback?.overall.score).toBe(0);
    expect(feedback?.overall.summary).toContain('failed');
  });
});
