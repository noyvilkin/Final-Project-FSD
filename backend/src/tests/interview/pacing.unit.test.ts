/**
 * Unit tests for PacingService
 * Pure function — no mocks, no DB, no network.
 */

process.env.S3_ENDPOINT         = 'http://localhost:9000';
process.env.S3_ACCESS_KEY_ID    = 'test';
process.env.S3_SECRET_ACCESS_KEY = 'test';
process.env.S3_BUCKET_NAME      = 'test';

import { PacingService } from '../../features/interview/services/pacingService.js';
import type { ITranscriptSegment } from '../../features/interview/models/interviewInsights.model.js';

const seg = (start: number, end: number, text: string): ITranscriptSegment => ({ start, end, text });

describe('PacingService.calculate', () => {
  it('returns zeros for empty transcript and no duration', () => {
    const result = PacingService.calculate('', [], undefined);
    expect(result.wordsPerMinute).toBe(0);
    expect(result.estimatedSpeakingDurationSeconds).toBe(0);
    expect(result.totalWordCount).toBe(0);
  });

  it('derives duration from segment span (last.end - first.start)', () => {
    const segments = [seg(0, 5, 'hello world'), seg(5, 65, 'continued')];
    // span = 65 - 0 = 65 seconds, words = 3
    const result = PacingService.calculate('hello world continued', segments);
    expect(result.estimatedSpeakingDurationSeconds).toBe(65);
    expect(result.totalWordCount).toBe(3);
    expect(result.wordsPerMinute).toBe(Math.round((3 / 65) * 60));
  });

  it('falls back to mediaDurationSeconds when segments are empty', () => {
    const result = PacingService.calculate('sixty words here', [], 30);
    expect(result.estimatedSpeakingDurationSeconds).toBe(30);
  });

  it('prefers segment span over mediaDurationSeconds', () => {
    const segments = [seg(0, 60, 'one two three')];
    const result = PacingService.calculate('one two three', segments, 999);
    expect(result.estimatedSpeakingDurationSeconds).toBe(60);
  });

  it('calculates WPM correctly for 120 words in 60 seconds', () => {
    const words    = Array(120).fill('word').join(' ');
    const segments = [seg(0, 60, words)];
    const result   = PacingService.calculate(words, segments);
    expect(result.wordsPerMinute).toBe(120);
  });

  it('counts words correctly (splits on whitespace)', () => {
    const result = PacingService.calculate('one two three four five', [], 60);
    expect(result.totalWordCount).toBe(5);
  });

  it('returns zero WPM when transcript has no words', () => {
    const result = PacingService.calculate('   ', [], 30);
    expect(result.wordsPerMinute).toBe(0);
  });

  it('handles single-segment correctly', () => {
    const segments = [seg(10, 70, 'test')]; // span = 60s
    const result   = PacingService.calculate('test word', segments);
    // 2 words / 60s * 60 = 2 wpm
    expect(result.wordsPerMinute).toBe(2);
    expect(result.estimatedSpeakingDurationSeconds).toBe(60);
  });
});
