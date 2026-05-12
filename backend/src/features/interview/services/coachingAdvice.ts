import type { GeminiClient } from "../../../common/services/geminiClient.js";
import {
  buildCoachingPayload,
  COACHING_PROMPT_VERSION,
  CoachingModelOutputSchema,
  type CoachingModelOutput,
  type CoachingPromptInput,
} from "../../../common/services/prompts/coachingPrompt.js";

import type {
  ICoachingOutput,
  ICoachingTip,
} from "../models/interviewInsights.model.js";

export interface GenerateCoachingArgs extends CoachingPromptInput {
  gemini:        GeminiClient;
  modelVersion?: string;
}

function parseModelResponse(raw: string): CoachingModelOutput {
  const cleaned = raw
    .replace(/^```(?:json)?\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    const msg = err instanceof SyntaxError ? err.message : String(err);
    throw new Error(`Coaching: invalid JSON — ${msg}`);
  }

  const result = CoachingModelOutputSchema.safeParse(parsed);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("; ");
    throw new Error(`Coaching: schema validation failed — ${detail}`);
  }
  return result.data;
}

export async function generateCoaching(
  args: GenerateCoachingArgs
): Promise<ICoachingOutput> {
  const payload = buildCoachingPayload({
    transcript: args.transcript,
    analyzers:  args.analyzers,
    readiness:  args.readiness,
  });
  const raw    = await args.gemini.generate(payload);
  const parsed = parseModelResponse(raw);

  const tips: ICoachingTip[] = parsed.tips.map((t) => ({
    type:             t.type,
    issue:            t.issue,
    suggestion:       t.suggestion,
    exampleRewording: t.exampleRewording,
  }));

  return {
    tips,
    promptVersion: COACHING_PROMPT_VERSION,
    modelVersion:  args.modelVersion,
  };
}
