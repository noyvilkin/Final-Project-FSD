import type {
  IAnalyzerOutputs,
  ICoachingOutput,
  IReadinessOutput,
} from "../models/interviewInsights.model.js";

// Aggregate "insights" subdoc shape (legacy — Mission 03 fills this so UIs
// that already consume `insights` keep working).
export interface AggregateInsights {
  overallScore: number;
  starAlignment: {
    score:     number;
    situation: { detected: boolean; feedback?: string };
    task:      { detected: boolean; feedback?: string };
    action:    { detected: boolean; feedback?: string };
    result:    { detected: boolean; feedback?: string };
  };
  fillerWords: {
    totalCount:    number;
    ratePerMinute: number;
    examples:      Array<{ word: string; count: number }>;
  };
  sentiment: {
    overallTone:  "confident" | "neutral" | "hesitant";
    clarityScore: number;
  };
  strengths:    string[];
  improvements: string[];
}

export interface ConsolidateArgs {
  analyzers: IAnalyzerOutputs;
  readiness: IReadinessOutput;
  coaching:  ICoachingOutput;
}

// Produces the legacy `insights` aggregate from analyzer outputs + readiness
// + coaching. Pure transformation — no IO; persistence happens upstream.
//
// Mapping:
//   overallScore      ← readiness.readinessScore
//   starAlignment.*   ← any-segment-detected ⟹ true; feedback = first matching
//                       segment text
//   fillerWords.*     ← analyzers.fillerWords with top-5 examples by count
//   sentiment         ← derived from confidence.confidenceScore + fluencyScore
//   strengths         ← coaching tips with suggestion language flagged as
//                       reinforcement (heuristic) — empty if none
//   improvements      ← coaching tip issues (max 5)
export function consolidateArtifact(args: ConsolidateArgs): AggregateInsights {
  const star = args.analyzers.starAlignment;

  const anyComponent = (key: "situation" | "task" | "action" | "result"): { detected: boolean; feedback?: string } => {
    if (!star) return { detected: false };
    const hit = star.segments.find((s) => s.components[key]);
    return hit
      ? { detected: true, feedback: hit.text }
      : { detected: false };
  };

  const fillers = args.analyzers.fillerWords;
  const fillerExamples = fillers
    ? Object.entries(fillers.counts)
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([word, count]) => ({ word, count }))
    : [];

  const confidence = args.analyzers.confidence;
  const tone: "confident" | "neutral" | "hesitant" = confidence
    ? (confidence.confidenceScore >= 70
        ? "confident"
        : confidence.confidenceScore >= 40
          ? "neutral"
          : "hesitant")
    : "neutral";

  const improvements = args.coaching.tips.map((t) => t.issue).slice(0, 5);
  const strengths = args.coaching.tips
    .filter((t) => t.exampleRewording)
    .map((t) => t.suggestion)
    .slice(0, 3);

  return {
    overallScore: Math.round(args.readiness.readinessScore),
    starAlignment: {
      score:     star?.starAlignmentScore ?? 0,
      situation: anyComponent("situation"),
      task:      anyComponent("task"),
      action:    anyComponent("action"),
      result:    anyComponent("result"),
    },
    fillerWords: {
      totalCount:    fillers?.total ?? 0,
      ratePerMinute: Math.round((fillers?.perMinute ?? 0) * 100) / 100,
      examples:      fillerExamples,
    },
    sentiment: {
      overallTone:  tone,
      clarityScore: Math.round(confidence?.fluencyScore ?? 0),
    },
    strengths,
    improvements,
  };
}
