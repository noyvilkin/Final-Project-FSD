import { consolidateArtifact } from "../../features/interview/services/artifactConsolidator.js";

describe("consolidateArtifact", () => {
  it("derives all aggregate fields from analyzer + readiness + coaching inputs", () => {
    const result = consolidateArtifact({
      analyzers: {
        contentQuality: {
          technicalAccuracy:     80,
          professionalRelevance: 90,
          justification:         "Strong, specific answer.",
          promptVersion:         "v1",
        },
        starAlignment: {
          starAlignmentScore: 75,
          segments: [
            {
              start: 0, end: 5, text: "I worked at Acme.",
              components: { situation: true, task: false, action: false, result: false },
            },
            {
              start: 5, end: 12, text: "I shipped a queue and it 10x'd throughput.",
              components: { situation: false, task: true, action: true, result: true },
            },
          ],
          promptVersion: "v1",
        },
        fillerWords: {
          counts:     { um: 3, like: 2, "you know": 0 },
          total:      5,
          totalWords: 100,
          density:    5,
          perMinute:  10,
        },
        confidence: {
          confidenceScore: 75,
          fluencyScore:    60,
          signals: {
            polarityAverage: 1.5,
            polarityScore:   65,
            fillerDensity:   5,
            wordsPerMinute:  120,
          },
        },
      },
      readiness: {
        readinessScore: 78,
        breakdown: { technical: 86, behavioral: 75, communication: 67 },
      },
      coaching: {
        promptVersion: "v1",
        tips: [
          {
            type:       "verbal",
            issue:      "Five fillers, mostly um/like.",
            suggestion: "Pause briefly when you'd say um.",
          },
          {
            type:             "behavioral",
            issue:            "Result is implicit — make it explicit.",
            suggestion:       "Lead with the 10x outcome.",
            exampleRewording: "We delivered a queue that 10x'd throughput.",
          },
        ],
      },
    });

    expect(result.overallScore).toBe(78);
    expect(result.starAlignment.score).toBe(75);
    expect(result.starAlignment.situation.detected).toBe(true);
    expect(result.starAlignment.result.detected).toBe(true);
    expect(result.starAlignment.result.feedback).toContain("queue");

    expect(result.fillerWords.totalCount).toBe(5);
    expect(result.fillerWords.examples[0]).toEqual({ word: "um", count: 3 });

    expect(result.sentiment.overallTone).toBe("confident");
    expect(result.sentiment.clarityScore).toBe(60);

    expect(result.improvements).toHaveLength(2);
    expect(result.strengths).toContain("Lead with the 10x outcome.");
  });

  it("maps confidence band to sentiment tone", () => {
    const base = {
      analyzers: {},
      readiness: {
        readinessScore: 50,
        breakdown: { technical: 50, behavioral: 50, communication: 50 },
      },
      coaching: { promptVersion: "v1", tips: [] },
    };

    const hesitant = consolidateArtifact({
      ...base,
      analyzers: {
        confidence: {
          confidenceScore: 20, fluencyScore: 20,
          signals: { polarityAverage: -2, polarityScore: 30, fillerDensity: 8, wordsPerMinute: 80 },
        },
      },
    });
    expect(hesitant.sentiment.overallTone).toBe("hesitant");

    const neutral = consolidateArtifact({
      ...base,
      analyzers: {
        confidence: {
          confidenceScore: 50, fluencyScore: 50,
          signals: { polarityAverage: 0, polarityScore: 50, fillerDensity: 4, wordsPerMinute: 130 },
        },
      },
    });
    expect(neutral.sentiment.overallTone).toBe("neutral");
  });

  it("handles missing analyzers gracefully", () => {
    const result = consolidateArtifact({
      analyzers: {},
      readiness: {
        readinessScore: 0,
        breakdown: { technical: 0, behavioral: 0, communication: 0 },
      },
      coaching: { promptVersion: "v1", tips: [] },
    });

    expect(result.overallScore).toBe(0);
    expect(result.starAlignment.score).toBe(0);
    expect(result.fillerWords.totalCount).toBe(0);
    expect(result.fillerWords.examples).toEqual([]);
    expect(result.sentiment.overallTone).toBe("neutral");
    expect(result.improvements).toEqual([]);
  });
});
