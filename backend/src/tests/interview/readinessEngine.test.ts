import { computeReadiness } from "../../features/interview/services/readinessEngine.js";

describe("computeReadiness", () => {
  it("combines analyzer outputs with the documented weights", () => {
    const result = computeReadiness({
      contentQuality: {
        technicalAccuracy:     80,
        professionalRelevance: 90,
        justification:         "x",
        promptVersion:         "v1",
      },
      starAlignment: {
        segments:           [],
        starAlignmentScore: 70,
        promptVersion:      "v1",
      },
      confidence: {
        confidenceScore: 60,
        fluencyScore:    80,
        signals: {
          polarityAverage: 1,
          polarityScore:   60,
          fillerDensity:   2,
          wordsPerMinute:  130,
        },
      },
    });

    // technical     = 0.4*80 + 0.6*90 = 86
    // behavioral    = 70
    // communication = 0.5*60 + 0.5*80 = 70
    // readiness     = 0.4*86 + 0.25*70 + 0.35*70 = 34.4 + 17.5 + 24.5 = 76.4
    expect(result.breakdown.technical).toBeCloseTo(86, 1);
    expect(result.breakdown.behavioral).toBeCloseTo(70, 1);
    expect(result.breakdown.communication).toBeCloseTo(70, 1);
    expect(result.readinessScore).toBeCloseTo(76.4, 1);
  });

  it("returns zeros when analyzers are missing", () => {
    const result = computeReadiness({});
    expect(result.readinessScore).toBe(0);
    expect(result.breakdown.technical).toBe(0);
    expect(result.breakdown.behavioral).toBe(0);
    expect(result.breakdown.communication).toBe(0);
  });

  it("keeps all scores within 0..100", () => {
    const result = computeReadiness({
      contentQuality: {
        technicalAccuracy:     100,
        professionalRelevance: 100,
        justification:         "x",
        promptVersion:         "v1",
      },
      starAlignment: {
        segments:           [],
        starAlignmentScore: 100,
        promptVersion:      "v1",
      },
      confidence: {
        confidenceScore: 100,
        fluencyScore:    100,
        signals: {
          polarityAverage: 5,
          polarityScore:   100,
          fillerDensity:   0,
          wordsPerMinute:  130,
        },
      },
    });

    expect(result.readinessScore).toBeLessThanOrEqual(100);
    expect(result.breakdown.technical).toBeLessThanOrEqual(100);
    expect(result.breakdown.behavioral).toBeLessThanOrEqual(100);
    expect(result.breakdown.communication).toBeLessThanOrEqual(100);
  });
});
