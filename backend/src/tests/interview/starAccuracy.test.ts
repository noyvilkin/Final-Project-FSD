import { evaluateStarAccuracy } from '../../features/interview/eval/starAccuracy';
import type { StarSegment } from '../../features/interview/eval/fixtures';

describe('evaluateStarAccuracy', () => {
  const fullTruthMap: StarSegment[] = [
    { label: 'situation', startWord: 0, endWord: 20 },
    { label: 'task', startWord: 21, endWord: 40 },
    { label: 'action', startWord: 41, endWord: 70 },
    { label: 'result', startWord: 71, endWord: 90 },
  ];

  it('returns perfect accuracy when predictions exactly match truth', () => {
    const result = evaluateStarAccuracy(fullTruthMap, [...fullTruthMap]);
    expect(result.accuracy).toBe(1);
    expect(result.detectedCount).toBe(4);
    expect(result.actionDetected).toBe(true);
    expect(result.averageIou).toBe(1);
  });

  it('detects all components with shifted boundaries (partial IoU)', () => {
    const shifted: StarSegment[] = fullTruthMap.map((seg) => ({
      ...seg,
      startWord: seg.startWord + 2,
      endWord: seg.endWord + 2,
    }));

    const result = evaluateStarAccuracy(fullTruthMap, shifted);
    expect(result.detectedCount).toBe(4);
    expect(result.accuracy).toBe(1);
    expect(result.actionDetected).toBe(true);
    // IoU should be less than 1 due to shift
    expect(result.averageIou).toBeGreaterThan(0);
    expect(result.averageIou).toBeLessThan(1);
  });

  it('reports missing components when predictions are absent', () => {
    // Only predict situation and task
    const partial: StarSegment[] = [
      { label: 'situation', startWord: 0, endWord: 20 },
      { label: 'task', startWord: 21, endWord: 40 },
    ];

    const result = evaluateStarAccuracy(fullTruthMap, partial);
    expect(result.detectedCount).toBe(2);
    expect(result.accuracy).toBe(0.5);
    expect(result.actionDetected).toBe(false);
  });

  it('correctly identifies action detection', () => {
    const withAction: StarSegment[] = [
      { label: 'action', startWord: 41, endWord: 70 },
    ];

    const result = evaluateStarAccuracy(fullTruthMap, withAction);
    expect(result.actionDetected).toBe(true);
    expect(result.detectedCount).toBe(1);
  });

  it('handles empty truth map', () => {
    const result = evaluateStarAccuracy([], []);
    expect(result.accuracy).toBe(1);
    expect(result.detectedCount).toBe(0);
    expect(result.actionDetected).toBe(false);
  });

  it('handles no overlap (completely wrong boundaries)', () => {
    const noOverlap: StarSegment[] = [
      { label: 'situation', startWord: 100, endWord: 120 },
      { label: 'task', startWord: 121, endWord: 140 },
      { label: 'action', startWord: 141, endWord: 160 },
      { label: 'result', startWord: 161, endWord: 180 },
    ];

    const result = evaluateStarAccuracy(fullTruthMap, noOverlap);
    expect(result.detectedCount).toBe(0);
    expect(result.accuracy).toBe(0);
    expect(result.actionDetected).toBe(false);
  });

  it('handles truth with only 3 components (missing result)', () => {
    const partialTruth: StarSegment[] = [
      { label: 'situation', startWord: 0, endWord: 18 },
      { label: 'task', startWord: 19, endWord: 29 },
      { label: 'action', startWord: 30, endWord: 52 },
    ];
    const predictions: StarSegment[] = [
      { label: 'situation', startWord: 0, endWord: 18 },
      { label: 'task', startWord: 19, endWord: 29 },
      { label: 'action', startWord: 30, endWord: 52 },
    ];

    const result = evaluateStarAccuracy(partialTruth, predictions);
    expect(result.accuracy).toBe(1);
    expect(result.totalExpected).toBe(3);
    expect(result.actionDetected).toBe(true);
  });

  it('calculates IoU correctly for overlapping ranges', () => {
    const truth: StarSegment[] = [
      { label: 'action', startWord: 10, endWord: 20 },
    ];
    // Overlap: 15-20 = 6 words; Union: 10-25 = 16 words; IoU = 6/16 = 0.375
    const predicted: StarSegment[] = [
      { label: 'action', startWord: 15, endWord: 25 },
    ];

    const result = evaluateStarAccuracy(truth, predicted);
    expect(result.detectedCount).toBe(1);
    expect(result.components[0].iou).toBeCloseTo(6 / 16);
  });
});
