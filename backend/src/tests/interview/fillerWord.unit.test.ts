/**
 * Unit tests for FillerWordService
 * Pure function — no mocks, no DB, no network.
 */

// Stub env vars required by modules that load on import (s3Upload, etc.)
process.env.S3_ENDPOINT         = 'http://localhost:9000';
process.env.S3_ACCESS_KEY_ID    = 'test';
process.env.S3_SECRET_ACCESS_KEY = 'test';
process.env.S3_BUCKET_NAME      = 'test';

import { FillerWordService } from '../../features/interview/services/fillerWordService.js';

describe('FillerWordService.count', () => {
  it('returns zero for an empty transcript', () => {
    const result = FillerWordService.count('');
    expect(result.totalCount).toBe(0);
    expect(result.breakdown).toHaveLength(0);
  });

  it('counts a single "um"', () => {
    const result = FillerWordService.count('Um, I think we should proceed.');
    expect(result.totalCount).toBe(1);
    expect(result.breakdown).toContainEqual({ word: 'um', count: 1 });
  });

  it('counts multiple occurrences of the same filler', () => {
    const result = FillerWordService.count('like it was like really like crazy');
    expect(result.breakdown.find((b) => b.word === 'like')?.count).toBe(3);
  });

  it('counts "you know" as a phrase, not as individual words', () => {
    const result = FillerWordService.count('You know, I know the answer. You know?');
    // "you know" appears twice; plain "know" alone should NOT count
    expect(result.breakdown.find((b) => b.word === 'you know')?.count).toBe(2);
  });

  it('counts "kind of" as a phrase', () => {
    const result = FillerWordService.count('It was kind of difficult, kind of stressful.');
    expect(result.breakdown.find((b) => b.word === 'kind of')?.count).toBe(2);
  });

  it('does NOT match "um" inside "yummy"', () => {
    const result = FillerWordService.count('The food was yummy and scrumptious.');
    expect(result.totalCount).toBe(0);
  });

  it('does NOT match "like" inside "liked" or "likely"', () => {
    const result = FillerWordService.count('I liked it and it was likely to work.');
    expect(result.totalCount).toBe(0);
  });

  it('is case-insensitive', () => {
    const result = FillerWordService.count('UM, UH, Actually BASICALLY');
    expect(result.breakdown.find((b) => b.word === 'um')?.count).toBe(1);
    expect(result.breakdown.find((b) => b.word === 'uh')?.count).toBe(1);
    expect(result.breakdown.find((b) => b.word === 'actually')?.count).toBe(1);
    expect(result.breakdown.find((b) => b.word === 'basically')?.count).toBe(1);
  });

  it('returns breakdown sorted descending by count', () => {
    const result = FillerWordService.count('um um um uh uh like');
    const counts = result.breakdown.map((b) => b.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('excludes fillers with zero count from breakdown', () => {
    const result = FillerWordService.count('basically');
    expect(result.breakdown.every((b) => b.count > 0)).toBe(true);
    expect(result.breakdown).not.toContainEqual({ word: 'um', count: 0 });
  });

  it('counts all supported fillers in one sentence', () => {
    const transcript =
      'Um, uh, like, you know, basically, actually, kind of, sort of — that covers everything.';
    const result = FillerWordService.count(transcript);
    expect(result.totalCount).toBe(8);
  });
});
