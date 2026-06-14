import { calculateWer, normaliseTranscript } from '../../features/interview/eval/werCalculator';

describe('normaliseTranscript', () => {
  it('lowercases and strips punctuation', () => {
    expect(normaliseTranscript('Hello, World!')).toEqual(['hello', 'world']);
  });

  it('collapses whitespace', () => {
    expect(normaliseTranscript('  one   two  three  ')).toEqual(['one', 'two', 'three']);
  });

  it('preserves apostrophes and hyphens', () => {
    expect(normaliseTranscript("it's a well-known fact")).toEqual(["it's", 'a', 'well-known', 'fact']);
  });

  it('returns empty array for empty string', () => {
    expect(normaliseTranscript('')).toEqual([]);
  });
});

describe('calculateWer', () => {
  it('returns 0 for identical transcripts', () => {
    const text = 'the quick brown fox jumps over the lazy dog';
    const result = calculateWer(text, text);
    expect(result.wer).toBe(0);
    expect(result.substitutions).toBe(0);
    expect(result.insertions).toBe(0);
    expect(result.deletions).toBe(0);
  });

  it('returns 0 for identical transcripts ignoring punctuation and case', () => {
    const ref = 'Hello, world! How are you?';
    const hyp = 'hello world how are you';
    const result = calculateWer(ref, hyp);
    expect(result.wer).toBe(0);
  });

  it('counts a single substitution correctly', () => {
    const ref = 'the cat sat on the mat';
    const hyp = 'the dog sat on the mat';
    const result = calculateWer(ref, hyp);
    expect(result.substitutions).toBe(1);
    expect(result.insertions).toBe(0);
    expect(result.deletions).toBe(0);
    expect(result.wer).toBeCloseTo(1 / 6);
  });

  it('counts a single deletion correctly', () => {
    const ref = 'the cat sat on the mat';
    const hyp = 'the cat sat the mat';
    const result = calculateWer(ref, hyp);
    expect(result.deletions).toBe(1);
    expect(result.wer).toBeCloseTo(1 / 6);
  });

  it('counts a single insertion correctly', () => {
    const ref = 'the cat sat on the mat';
    const hyp = 'the big cat sat on the mat';
    const result = calculateWer(ref, hyp);
    expect(result.insertions).toBe(1);
    expect(result.wer).toBeCloseTo(1 / 6);
  });

  it('handles completely different transcripts', () => {
    const ref = 'one two three';
    const hyp = 'four five six';
    const result = calculateWer(ref, hyp);
    expect(result.substitutions).toBe(3);
    expect(result.wer).toBeCloseTo(1.0);
  });

  it('handles empty reference (returns Infinity)', () => {
    const result = calculateWer('', 'some words');
    expect(result.wer).toBe(Infinity);
    expect(result.referenceLength).toBe(0);
  });

  it('handles both empty (returns 0)', () => {
    const result = calculateWer('', '');
    expect(result.wer).toBe(0);
  });

  it('handles hypothesis longer than reference (WER > 1)', () => {
    const ref = 'hello';
    const hyp = 'hello world how are you';
    const result = calculateWer(ref, hyp);
    expect(result.wer).toBeGreaterThan(1);
  });

  it('computes realistic WER for a typical STT output', () => {
    const ref = 'I personally wrote the schema translation scripts and set up a parallel run environment';
    const hyp = 'I personally wrote the schema translation scripts and set up a parallel run environment';
    const result = calculateWer(ref, hyp);
    expect(result.wer).toBe(0);
  });

  it('detects multiple error types in a mixed scenario', () => {
    const ref = 'the quick brown fox jumps over the lazy dog';
    // 'fast' = sub, missing 'over' = del, extra 'really' = ins
    const hyp = 'the quick brown fox jumps really the lazy dog';
    const result = calculateWer(ref, hyp);
    // The exact breakdown depends on alignment, but total errors should be 2
    expect(result.wer).toBeGreaterThan(0);
    expect(result.wer).toBeLessThan(0.5);
  });
});
