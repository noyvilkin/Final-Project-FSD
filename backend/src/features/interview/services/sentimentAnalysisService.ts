/**
 * Sentiment Analysis Service
 *
 * Uses Gemini to assess confidence, clarity, and overall tone from an
 * interview transcript. Returns structured ISentiment data compatible
 * with the interviewInsights model.
 */

import { GeminiClient, GeminiPayload } from '../../../common/services/geminiClient.js';

/** Matches ISentiment from interviewInsights.model */
export interface SentimentResult {
  overallTone: 'confident' | 'neutral' | 'hesitant';
  clarityScore: number;
}

/** Extended result with optional supporting detail */
export interface SentimentAnalysisResult extends SentimentResult {
  /** Key language signals that informed the assessment */
  signals?: string[];
}

/** Expected Gemini response shape */
interface GeminiSentimentResponse {
  overallTone: string;
  clarityScore: number;
  signals?: string[];
}

const SENTIMENT_SYSTEM_PROMPT = `You are an expert communication coach analyzing interview transcript language.
Assess the candidate's communication style for confidence and clarity.

Evaluation criteria:

OVERALL TONE — classify as one of:
- "confident": Uses decisive language ("I led", "I decided", "I implemented"),
  active voice, specific details, assertive statements, minimal hedging.
- "neutral": Mix of confident and hesitant markers; neither strongly assertive
  nor noticeably uncertain. Adequate but unremarkable delivery.
- "hesitant": Frequent hedging ("I think maybe", "sort of", "I guess"),
  passive voice, vague descriptions, excessive qualifiers, uncertain language.

CLARITY SCORE (0-100):
- How clearly and concisely the candidate communicates their points.
- High clarity: Well-structured responses, specific examples, logical flow.
- Low clarity: Rambling, tangential, contradictory, or hard-to-follow responses.

SIGNALS:
- List 2-5 specific language patterns you observed that informed your assessment.
  Quote brief examples from the transcript where relevant.

Respond with ONLY valid JSON matching this exact structure:
{
  "overallTone": "confident" | "neutral" | "hesitant",
  "clarityScore": <number 0-100>,
  "signals": ["<signal description>", ...]
}`;

/**
 * Analyze the sentiment/confidence/clarity of an interview transcript.
 *
 * @param geminiClient  Shared Gemini client instance
 * @param transcript    The interview transcript text
 * @param fillerRate    Optional filler-word rate per minute (provides extra context)
 * @returns             Structured sentiment analysis result
 */
export async function analyzeSentiment(
  geminiClient: GeminiClient,
  transcript: string,
  fillerRate?: number,
): Promise<SentimentAnalysisResult> {
  if (!transcript || transcript.trim().length === 0) {
    return {
      overallTone: 'neutral',
      clarityScore: 0,
      signals: ['No transcript provided for analysis.'],
    };
  }

  let userMessage = `Analyze the following interview transcript:\n\n${transcript}`;

  if (fillerRate !== undefined) {
    userMessage += `\n\nAdditional context: The candidate's filler word rate is ${fillerRate} per minute.`;
  }

  const payload: GeminiPayload = {
    system_instruction: {
      parts: [{ text: SENTIMENT_SYSTEM_PROMPT }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userMessage }],
      },
    ],
  };

  const rawResponse = await geminiClient.generate(payload);
  return parseSentimentResponse(rawResponse);
}

/**
 * Parse and validate the Gemini JSON response into a SentimentAnalysisResult.
 */
export function parseSentimentResponse(rawJson: string): SentimentAnalysisResult {
  const cleaned = rawJson.replace(/```(?:json)?\s*/g, '').replace(/```\s*$/g, '').trim();

  let parsed: GeminiSentimentResponse;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse sentiment response as JSON: ${cleaned.slice(0, 200)}`);
  }

  const validTones = ['confident', 'neutral', 'hesitant'] as const;
  const tone = validTones.includes(parsed.overallTone as typeof validTones[number])
    ? (parsed.overallTone as typeof validTones[number])
    : 'neutral';

  const clarityScore = typeof parsed.clarityScore === 'number'
    ? Math.max(0, Math.min(100, Math.round(parsed.clarityScore)))
    : 50;

  const signals = Array.isArray(parsed.signals)
    ? parsed.signals.filter((s): s is string => typeof s === 'string').slice(0, 10)
    : undefined;

  return { overallTone: tone, clarityScore, signals };
}
