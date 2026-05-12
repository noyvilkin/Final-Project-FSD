import { z } from "zod";

import type {
  GeminiContent,
  GeminiPayload,
} from "../../types/geminiTypes.js";

export const COACHING_PROMPT_VERSION = "v1" as const;

// ---------------------------------------------------------------------------
// Output schema (validated after the Gemini call)
// ---------------------------------------------------------------------------

const CoachingTipModelSchema = z.object({
  type:             z.enum(["technical", "behavioral", "verbal"]),
  issue:            z.string().min(1).max(500),
  suggestion:       z.string().min(1).max(800),
  exampleRewording: z.string().min(1).max(800).optional(),
});

export const CoachingModelOutputSchema = z.object({
  tips: z.array(CoachingTipModelSchema).max(5),
});

export type CoachingModelOutput = z.infer<typeof CoachingModelOutputSchema>;

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

export interface CoachingPromptInput {
  transcript: string;
  analyzers: {
    contentQuality?: { technicalAccuracy: number; professionalRelevance: number; justification: string };
    starAlignment?:  { starAlignmentScore: number };
    fillerWords?:    { total: number; density: number; perMinute: number };
    confidence?:     { confidenceScore: number; fluencyScore: number };
  };
  readiness: {
    readinessScore: number;
    breakdown:      { technical: number; behavioral: number; communication: number };
  };
}

function buildSystemInstruction(): string {
  return `You are an interview coach producing actionable improvement tips
(Prompt ${COACHING_PROMPT_VERSION}).

Given a candidate's interview transcript, the analyzer outputs, and the
computed readiness breakdown, produce UP TO 5 specific, evidence-grounded
coaching tips. Each tip must:
  - Cite something concrete from the transcript (don't generalise).
  - Be one of three types:
      technical  — content accuracy, depth, or relevance
      behavioral — STAR structure, ownership, results
      verbal     — fillers, pacing, sentiment/tone
  - Include a suggestion the candidate can apply on their next attempt.
  - Optionally include exampleRewording: an explicit better phrasing the
    candidate could use.

Output contract:
- Return ONLY a JSON object matching the required shape.
- At most 5 tips. Fewer is fine if there isn't enough material.
- Prefer tips that target the lowest-scoring breakdown component.`;
}

function buildUserMessage(input: CoachingPromptInput): GeminiContent {
  const analyzersBlock = JSON.stringify(input.analyzers, null, 2);
  const readinessBlock = JSON.stringify(input.readiness, null, 2);

  const text = `## Transcript
"""
${input.transcript}
"""

## Analyzer outputs
${analyzersBlock}

## Readiness breakdown
${readinessBlock}

## Required JSON Output
{
  "tips": [
    {
      "type":             "<technical | behavioral | verbal>",
      "issue":            "<what specifically the candidate did or missed>",
      "suggestion":       "<concrete advice for next time>",
      "exampleRewording": "<optional — verbatim better phrasing>"
    }
  ]
}`;

  return { role: "user", parts: [{ text }] };
}

export function buildCoachingPayload(input: CoachingPromptInput): GeminiPayload {
  return {
    system_instruction: { parts: [{ text: buildSystemInstruction() }] },
    contents:           [buildUserMessage(input)],
  };
}
