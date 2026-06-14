/**
 * STAR Evaluation Service
 *
 * Uses Gemini to evaluate interview responses against the STAR method
 * (Situation, Task, Action, Result). Returns structured IStarAlignment data
 * compatible with the interviewInsights model.
 */

import { GeminiClient, GeminiPayload } from '../../../common/services/geminiClient.js';

/** Matches IStarComponent from interviewInsights.model */
export interface StarComponent {
  detected: boolean;
  feedback?: string;
}

/** Matches IStarAlignment from interviewInsights.model */
export interface StarAlignmentResult {
  score: number;
  situation: StarComponent;
  task: StarComponent;
  action: StarComponent;
  result: StarComponent;
}

/** The JSON schema we expect Gemini to return */
interface GeminiStarResponse {
  score: number;
  situation: { detected: boolean; feedback: string };
  task: { detected: boolean; feedback: string };
  action: { detected: boolean; feedback: string };
  result: { detected: boolean; feedback: string };
}

const STAR_SYSTEM_PROMPT = `You are an expert interview coach specializing in behavioral interview analysis.
Your task is to evaluate an interview response using the STAR method framework.

STAR components:
- Situation: Did the candidate describe the context or background? (who, what, where, when)
- Task: Did the candidate explain their specific responsibility or challenge?
- Action: Did the candidate describe the concrete steps THEY personally took? (first person, specific actions)
- Result: Did the candidate share the outcome, impact, or what they learned?

Scoring guidelines:
- 0-25: Missing most STAR components; vague or off-topic response
- 26-50: One or two components present but weak; lacks specificity
- 51-75: Most components present; some lack detail or specificity
- 76-100: All four components present with clear, specific details

For each component, set "detected" to true only if the component is clearly present with
sufficient detail. Provide brief, actionable feedback for each component.

Respond with ONLY valid JSON matching this exact structure:
{
  "score": <number 0-100>,
  "situation": { "detected": <boolean>, "feedback": "<string>" },
  "task": { "detected": <boolean>, "feedback": "<string>" },
  "action": { "detected": <boolean>, "feedback": "<string>" },
  "result": { "detected": <boolean>, "feedback": "<string>" }
}`;

/**
 * Evaluate a single interview response against the STAR method.
 *
 * @param geminiClient  Shared Gemini client instance
 * @param transcript    The candidate's response text to evaluate
 * @param question      Optional: the interview question that prompted this response
 * @returns             Structured STAR alignment result
 */
export async function evaluateStarAlignment(
  geminiClient: GeminiClient,
  transcript: string,
  question?: string,
): Promise<StarAlignmentResult> {
  if (!transcript || transcript.trim().length === 0) {
    return {
      score: 0,
      situation: { detected: false, feedback: 'No response provided.' },
      task: { detected: false, feedback: 'No response provided.' },
      action: { detected: false, feedback: 'No response provided.' },
      result: { detected: false, feedback: 'No response provided.' },
    };
  }

  const userMessage = question
    ? `Interview Question: ${question}\n\nCandidate Response:\n${transcript}`
    : `Candidate Response:\n${transcript}`;

  const payload: GeminiPayload = {
    system_instruction: {
      parts: [{ text: STAR_SYSTEM_PROMPT }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userMessage }],
      },
    ],
  };

  const rawResponse = await geminiClient.generate(payload);
  return parseStarResponse(rawResponse);
}

/**
 * Parse and validate the Gemini JSON response into a StarAlignmentResult.
 * Applies defensive defaults for malformed responses.
 */
export function parseStarResponse(rawJson: string): StarAlignmentResult {
  // Strip markdown code fences if present
  const cleaned = rawJson.replace(/```(?:json)?\s*/g, '').replace(/```\s*$/g, '').trim();

  let parsed: GeminiStarResponse;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse STAR evaluation response as JSON: ${cleaned.slice(0, 200)}`);
  }

  const clampScore = (n: unknown): number => {
    const val = typeof n === 'number' ? n : 0;
    return Math.max(0, Math.min(100, Math.round(val)));
  };

  const toComponent = (c: unknown): StarComponent => {
    if (c && typeof c === 'object' && 'detected' in c) {
      const obj = c as { detected: unknown; feedback?: unknown };
      return {
        detected: Boolean(obj.detected),
        feedback: typeof obj.feedback === 'string' ? obj.feedback : undefined,
      };
    }
    return { detected: false };
  };

  return {
    score: clampScore(parsed.score),
    situation: toComponent(parsed.situation),
    task: toComponent(parsed.task),
    action: toComponent(parsed.action),
    result: toComponent(parsed.result),
  };
}
