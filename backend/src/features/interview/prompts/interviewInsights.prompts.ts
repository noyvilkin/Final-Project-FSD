import type { ITranscriptSegment } from '../models/interviewInsights.model.js';

// ─── System instruction ───────────────────────────────────────────────────────

export const INTERVIEW_INSIGHTS_SYSTEM_INSTRUCTION = `
You are an expert behavioral interview coach and communication analyst.

Your task is to analyse a candidate's interview response using the STAR framework
(Situation, Task, Action, Result) and provide structured, actionable feedback.

CRITICAL RULE — Candidate vs. Team Actions:
When analysing the "Action" component you MUST carefully distinguish between:
  • Actions the CANDIDATE personally performed (I designed, I proposed, I led)
  • Actions the TEAM performed (we built, our team decided, they implemented)

The Action score and candidateOwnedAction flag must reflect ONLY the candidate's
individual contributions. If the candidate consistently says "we" or "the team"
without clarifying their personal role, set teamOnlyLanguageDetected to true and
lower the Action score accordingly.

Output rules:
  • Return ONLY valid JSON — no markdown, no prose, no code fences.
  • All numeric scores are integers 0–100.
  • start/end timestamps are seconds (number) or null if not identifiable.
  • All string fields must be non-null (use "" if not applicable).
  • Arrays must be non-null (use [] if not applicable).
`.trim();

// ─── User message builder ─────────────────────────────────────────────────────

export function buildInterviewInsightsPrompt(
  transcript:    string,
  segments:      ITranscriptSegment[],
  fillerCount:   number,
  wordsPerMinute: number
): string {
  const segmentSummary = segments.length > 0
    ? segments
        .slice(0, 30) // send at most 30 segments to stay within token budget
        .map((s) => `[${s.start.toFixed(1)}s–${s.end.toFixed(1)}s] ${s.text}`)
        .join('\n')
    : 'No timestamped segments available.';

  return `
Analyse the following interview answer.

─── Transcript ────────────────────────────────────────────────────────────────
${transcript}

─── Timestamped segments (use to pinpoint start/end for each STAR section) ───
${segmentSummary}

─── Pre-computed metrics (do NOT recalculate these) ──────────────────────────
Filler word count: ${fillerCount}
Words per minute : ${wordsPerMinute}

─── Required JSON output format ──────────────────────────────────────────────
Return ONLY this JSON object with all fields populated:

{
  "starAnalysis": {
    "situation": {
      "text":     "<brief summary of situation content>",
      "start":    <seconds | null>,
      "end":      <seconds | null>,
      "score":    <0–100>,
      "feedback": "<coaching feedback>"
    },
    "task": {
      "text":     "<brief summary of task content>",
      "start":    <seconds | null>,
      "end":      <seconds | null>,
      "score":    <0–100>,
      "feedback": "<coaching feedback>"
    },
    "action": {
      "text":                    "<brief summary of actions described>",
      "start":                   <seconds | null>,
      "end":                     <seconds | null>,
      "score":                   <0–100>,
      "feedback":                "<coaching feedback, flag team vs candidate clearly>",
      "candidateOwnedAction":    <true if candidate clearly describes personal actions>,
      "teamOnlyLanguageDetected": <true if candidate uses only 'we'/'the team' language>
    },
    "result": {
      "text":     "<brief summary of result content>",
      "start":    <seconds | null>,
      "end":      <seconds | null>,
      "score":    <0–100>,
      "feedback": "<coaching feedback>"
    }
  },
  "candidateActionAssessment": {
    "candidateOwnedActionScore": <0–100>,
    "usesPersonalAgency":        <true if uses 'I' consistently>,
    "teamLanguageDetected":      <true if heavy use of 'we'/'the team'>,
    "feedback":                  "<overall personal agency feedback>"
  },
  "confidenceScore": <0–100>,
  "strengths":       ["<strength 1>", "<strength 2>"],
  "weaknesses":      ["<weakness 1>", "<weakness 2>"],
  "recommendations": ["<recommendation 1>", "<recommendation 2>"]
}
`.trim();
}
