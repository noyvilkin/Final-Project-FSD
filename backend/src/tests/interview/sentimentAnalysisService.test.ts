import { analyzeSentiment, parseSentimentResponse } from '../../features/interview/services/sentimentAnalysisService.js';
import type { LLMClient } from '../../common/services/llmClient.js';

describe('sentimentAnalysisService', () => {
  let mockLlmClient: jest.Mocked<LLMClient>;

  beforeEach(() => {
    mockLlmClient = {
      model: 'test-model',
      generate: jest.fn(),
    } as unknown as jest.Mocked<LLMClient>;
  });

  describe('parseSentimentResponse', () => {
    it('should parse a valid sentiment JSON response', () => {
      const json = JSON.stringify({
        overallTone: 'confident',
        clarityScore: 85,
        signals: ['Uses active voice', 'Specific metrics cited'],
      });

      const result = parseSentimentResponse(json);

      expect(result.overallTone).toBe('confident');
      expect(result.clarityScore).toBe(85);
      expect(result.signals).toEqual(['Uses active voice', 'Specific metrics cited']);
    });

    it('should handle JSON wrapped in markdown code fences', () => {
      const json = '```json\n{"overallTone":"hesitant","clarityScore":30,"signals":["Excessive hedging"]}\n```';

      const result = parseSentimentResponse(json);
      expect(result.overallTone).toBe('hesitant');
      expect(result.clarityScore).toBe(30);
    });

    it('should default to neutral for invalid tone values', () => {
      const json = JSON.stringify({
        overallTone: 'aggressive',
        clarityScore: 50,
      });

      expect(parseSentimentResponse(json).overallTone).toBe('neutral');
    });

    it('should clamp clarity score to 0-100', () => {
      const json = JSON.stringify({ overallTone: 'confident', clarityScore: 150 });
      expect(parseSentimentResponse(json).clarityScore).toBe(100);

      const jsonNeg = JSON.stringify({ overallTone: 'neutral', clarityScore: -20 });
      expect(parseSentimentResponse(jsonNeg).clarityScore).toBe(0);
    });

    it('should default clarity score to 50 for non-numeric value', () => {
      const json = JSON.stringify({ overallTone: 'neutral', clarityScore: 'high' });
      expect(parseSentimentResponse(json).clarityScore).toBe(50);
    });

    it('should handle missing signals array', () => {
      const json = JSON.stringify({ overallTone: 'neutral', clarityScore: 60 });
      const result = parseSentimentResponse(json);
      expect(result.signals).toBeUndefined();
    });

    it('should filter non-string signals', () => {
      const json = JSON.stringify({
        overallTone: 'confident',
        clarityScore: 80,
        signals: ['valid signal', 42, null, 'another signal'],
      });

      const result = parseSentimentResponse(json);
      expect(result.signals).toEqual(['valid signal', 'another signal']);
    });

    it('should limit signals to 10 entries', () => {
      const signals = Array.from({ length: 15 }, (_, i) => `signal ${i}`);
      const json = JSON.stringify({ overallTone: 'neutral', clarityScore: 50, signals });

      const result = parseSentimentResponse(json);
      expect(result.signals!.length).toBe(10);
    });

    it('should throw on invalid JSON', () => {
      expect(() => parseSentimentResponse('not json')).toThrow(
        /Failed to parse sentiment response/,
      );
    });

    it('should round fractional clarity scores', () => {
      const json = JSON.stringify({ overallTone: 'neutral', clarityScore: 72.6 });
      expect(parseSentimentResponse(json).clarityScore).toBe(73);
    });
  });

  describe('analyzeSentiment', () => {
    it('should return default result for empty transcript', async () => {
      const result = await analyzeSentiment(mockLlmClient, '');

      expect(result.overallTone).toBe('neutral');
      expect(result.clarityScore).toBe(0);
      expect(mockLlmClient.generate).not.toHaveBeenCalled();
    });

    it('should call the LLM and return parsed result', async () => {
      mockLlmClient.generate.mockResolvedValue(
        JSON.stringify({
          overallTone: 'confident',
          clarityScore: 88,
          signals: ['Strong action verbs', 'Clear structure'],
        }),
      );

      const result = await analyzeSentiment(
        mockLlmClient,
        'I led the initiative to restructure our CI/CD pipeline, reducing build times by 60%.',
      );

      expect(mockLlmClient.generate).toHaveBeenCalledTimes(1);
      expect(result.overallTone).toBe('confident');
      expect(result.clarityScore).toBe(88);
      expect(result.signals).toHaveLength(2);
    });

    it('should include filler rate context when provided', async () => {
      mockLlmClient.generate.mockResolvedValue(
        JSON.stringify({ overallTone: 'hesitant', clarityScore: 40, signals: [] }),
      );

      await analyzeSentiment(mockLlmClient, 'Some transcript.', 8.5);

      const payload = mockLlmClient.generate.mock.calls[0][0];
      const userText = payload.contents[0].parts[0].text;
      expect(userText).toContain('8.5 per minute');
    });

    it('should not include filler rate when not provided', async () => {
      mockLlmClient.generate.mockResolvedValue(
        JSON.stringify({ overallTone: 'neutral', clarityScore: 60, signals: [] }),
      );

      await analyzeSentiment(mockLlmClient, 'Some transcript.');

      const payload = mockLlmClient.generate.mock.calls[0][0];
      const userText = payload.contents[0].parts[0].text;
      expect(userText).not.toContain('filler word rate');
    });

    it('should include sentiment system prompt', async () => {
      mockLlmClient.generate.mockResolvedValue(
        JSON.stringify({ overallTone: 'neutral', clarityScore: 50, signals: [] }),
      );

      await analyzeSentiment(mockLlmClient, 'Test transcript.');

      const payload = mockLlmClient.generate.mock.calls[0][0];
      expect(payload.system_instruction).toBeDefined();
      expect(payload.system_instruction!.parts[0].text).toContain('confident');
      expect(payload.system_instruction!.parts[0].text).toContain('hesitant');
      expect(payload.system_instruction!.parts[0].text).toContain('CLARITY SCORE');
    });

    it('should propagate LLM errors', async () => {
      mockLlmClient.generate.mockRejectedValue(new Error('Rate limit exceeded'));

      await expect(analyzeSentiment(mockLlmClient, 'Some text.')).rejects.toThrow(
        'Rate limit exceeded',
      );
    });

    it('should handle the LLM returning markdown-wrapped JSON', async () => {
      mockLlmClient.generate.mockResolvedValue(
        '```json\n{"overallTone":"confident","clarityScore":92,"signals":["Clear and direct"]}\n```',
      );

      const result = await analyzeSentiment(mockLlmClient, 'I implemented the solution.');
      expect(result.overallTone).toBe('confident');
      expect(result.clarityScore).toBe(92);
    });
  });
});
