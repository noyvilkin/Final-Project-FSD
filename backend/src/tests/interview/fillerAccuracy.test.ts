import { evaluateFillerAccuracy } from '../../features/interview/eval/fillerAccuracy';
import type { FillerWordsSummary } from '../../features/interview/eval/fixtures';

describe('evaluateFillerAccuracy', () => {
  it('returns withinTolerance=true when counts match exactly', () => {
    const truth: FillerWordsSummary = {
      totalCount: 5,
      ratePerMinute: 7.5,
      examples: [
        { word: 'um', count: 3 },
        { word: 'like', count: 2 },
      ],
    };

    const result = evaluateFillerAccuracy(truth, truth);
    expect(result.withinTolerance).toBe(true);
    expect(result.delta).toBe(0);
    expect(result.expectedCount).toBe(5);
    expect(result.actualCount).toBe(5);
  });

  it('returns withinTolerance=true when delta is within default tolerance (3)', () => {
    const truth: FillerWordsSummary = {
      totalCount: 10,
      ratePerMinute: 15,
      examples: [{ word: 'um', count: 10 }],
    };
    const predicted: FillerWordsSummary = {
      totalCount: 12,
      ratePerMinute: 18,
      examples: [{ word: 'um', count: 12 }],
    };

    const result = evaluateFillerAccuracy(truth, predicted);
    expect(result.withinTolerance).toBe(true);
    expect(result.delta).toBe(2);
  });

  it('returns withinTolerance=false when delta exceeds tolerance', () => {
    const truth: FillerWordsSummary = {
      totalCount: 10,
      ratePerMinute: 15,
      examples: [{ word: 'um', count: 10 }],
    };
    const predicted: FillerWordsSummary = {
      totalCount: 14,
      ratePerMinute: 21,
      examples: [{ word: 'um', count: 14 }],
    };

    const result = evaluateFillerAccuracy(truth, predicted);
    expect(result.withinTolerance).toBe(false);
    expect(result.delta).toBe(4);
  });

  it('handles zero filler words in both truth and prediction', () => {
    const zero: FillerWordsSummary = {
      totalCount: 0,
      ratePerMinute: 0,
      examples: [],
    };

    const result = evaluateFillerAccuracy(zero, zero);
    expect(result.withinTolerance).toBe(true);
    expect(result.delta).toBe(0);
    expect(result.perWord).toEqual([]);
  });

  it('tracks per-word breakdown correctly', () => {
    const truth: FillerWordsSummary = {
      totalCount: 5,
      ratePerMinute: 7.5,
      examples: [
        { word: 'um', count: 3 },
        { word: 'like', count: 2 },
      ],
    };
    const predicted: FillerWordsSummary = {
      totalCount: 6,
      ratePerMinute: 9,
      examples: [
        { word: 'um', count: 4 },
        { word: 'uh', count: 2 },
      ],
    };

    const result = evaluateFillerAccuracy(truth, predicted);
    expect(result.perWord).toHaveLength(3); // um, like, uh

    const umWord = result.perWord.find((w) => w.word === 'um');
    expect(umWord?.expected).toBe(3);
    expect(umWord?.actual).toBe(4);
    expect(umWord?.delta).toBe(1);

    const likeWord = result.perWord.find((w) => w.word === 'like');
    expect(likeWord?.expected).toBe(2);
    expect(likeWord?.actual).toBe(0);

    const uhWord = result.perWord.find((w) => w.word === 'uh');
    expect(uhWord?.expected).toBe(0);
    expect(uhWord?.actual).toBe(2);
  });

  it('respects custom tolerance', () => {
    const truth: FillerWordsSummary = {
      totalCount: 10,
      ratePerMinute: 15,
      examples: [],
    };
    const predicted: FillerWordsSummary = {
      totalCount: 12,
      ratePerMinute: 18,
      examples: [],
    };

    // Tolerance of 1 should fail (delta = 2)
    const strict = evaluateFillerAccuracy(truth, predicted, 1);
    expect(strict.withinTolerance).toBe(false);

    // Tolerance of 5 should pass (delta = 2)
    const relaxed = evaluateFillerAccuracy(truth, predicted, 5);
    expect(relaxed.withinTolerance).toBe(true);
  });

  it('handles prediction with more filler words than truth', () => {
    const truth: FillerWordsSummary = {
      totalCount: 0,
      ratePerMinute: 0,
      examples: [],
    };
    const predicted: FillerWordsSummary = {
      totalCount: 3,
      ratePerMinute: 4.5,
      examples: [{ word: 'um', count: 3 }],
    };

    const result = evaluateFillerAccuracy(truth, predicted);
    expect(result.withinTolerance).toBe(true); // delta = 3, tolerance = 3
    expect(result.delta).toBe(3);
  });

  it('returns withinTolerance=false at exactly tolerance+1', () => {
    const truth: FillerWordsSummary = {
      totalCount: 5,
      ratePerMinute: 7.5,
      examples: [],
    };
    const predicted: FillerWordsSummary = {
      totalCount: 9,
      ratePerMinute: 13.5,
      examples: [],
    };

    const result = evaluateFillerAccuracy(truth, predicted, 3);
    expect(result.delta).toBe(4);
    expect(result.withinTolerance).toBe(false);
  });
});
