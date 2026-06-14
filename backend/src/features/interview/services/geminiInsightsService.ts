import { GeminiClient } from '../../../common/services/geminiClient.js';
import { appLogger } from '../../../common/services/logger.js';
import {
  INTERVIEW_INSIGHTS_SYSTEM_INSTRUCTION,
  buildInterviewInsightsPrompt,
} from '../prompts/interviewInsights.prompts.js';
import type {
  ITranscriptSegment,
  IStarAnalysis,
  ICandidateActionAssessment,
} from '../models/interviewInsights.model.js';

// ─── Typed result ─────────────────────────────────────────────────────────────

export interface GeminiInsightsResult {
  starAnalysis:              IStarAnalysis;
  candidateActionAssessment: ICandidateActionAssessment;
  confidenceScore:           number;
  strengths:                 string[];
  weaknesses:                string[];
  recommendations:           string[];
  /** Model identifier used, for provenance tracking. */
  model:                     string;
  /** Provider identifier. */
  provider:                  'google-gemini';
}

// ─── Validation error ─────────────────────────────────────────────────────────

export class GeminiInsightsParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiInsightsParseError';
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Calls the Gemini API to generate STAR-based interview insights.
 *
 * Follows the same static-class, lazy-singleton pattern as AIAnalysisService
 * and ProfileAnalysisService — reads GEMINI_API_KEY from env, reuses
 * the shared GeminiClient with its built-in rate limiter and retry logic.
 */
export class GeminiInsightsService {
  private static geminiClient: GeminiClient | null = null;

  private static getClient(): GeminiClient {
    if (!GeminiInsightsService.geminiClient) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY environment variable is required for interview insights');
      }
      GeminiInsightsService.geminiClient = new GeminiClient({
        apiKey,
        model:           process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
        temperature:     0.2,
        maxOutputTokens: 8_192,
        rateLimiter: {
          requestsPerMinute: 8,
          requestsPerDay:    1_200,
        },
      });
    }
    return GeminiInsightsService.geminiClient;
  }

  /**
   * Generate STAR-based insights for an interview transcript.
   *
   * @param transcript    Full plain-text transcript.
   * @param segments      Timestamped segments from Whisper.
   * @param fillerCount   Pre-computed total filler word count.
   * @param wordsPerMinute Pre-computed WPM value.
   */
  static async analyse(
    transcript:    string,
    segments:      ITranscriptSegment[],
    fillerCount:   number,
    wordsPerMinute: number
  ): Promise<GeminiInsightsResult> {
    const client = GeminiInsightsService.getClient();
    const model  = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

    const userMessage = buildInterviewInsightsPrompt(
      transcript,
      segments,
      fillerCount,
      wordsPerMinute
    );

    appLogger.info('[GeminiInsightsService] Sending transcript for analysis', {
      transcriptLength: transcript.length,
      segmentCount:     segments.length,
      fillerCount,
      wordsPerMinute,
    });

    const rawResponse = await client.generate({
      system_instruction: {
        parts: [{ text: INTERVIEW_INSIGHTS_SYSTEM_INSTRUCTION }],
      },
      contents: [
        { role: 'user', parts: [{ text: userMessage }] },
      ],
    });

    appLogger.info('[GeminiInsightsService] Raw response received', {
      responseLength: rawResponse.length,
    });

    const parsed = GeminiInsightsService.parseAndValidate(rawResponse);

    return { ...parsed, model, provider: 'google-gemini' };
  }

  // ── Parsing & validation ──────────────────────────────────────────────────

  /**
   * Parse and structurally validate the raw JSON string from Gemini.
   * Throws GeminiInsightsParseError on any parse or validation failure.
   */
  static parseAndValidate(raw: string): Omit<GeminiInsightsResult, 'model' | 'provider'> {
    // Strip markdown code fences if Gemini added them despite instructions
    let cleaned = raw.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      throw new GeminiInsightsParseError(
        `Gemini returned invalid JSON. Preview: ${raw.slice(0, 200)}`
      );
    }

    return {
      starAnalysis:              GeminiInsightsService.validateStarAnalysis(parsed),
      candidateActionAssessment: GeminiInsightsService.validateCandidateAssessment(parsed),
      confidenceScore:           GeminiInsightsService.clampScore(parsed['confidenceScore']),
      strengths:                 GeminiInsightsService.toStringArray(parsed['strengths']),
      weaknesses:                GeminiInsightsService.toStringArray(parsed['weaknesses']),
      recommendations:           GeminiInsightsService.toStringArray(parsed['recommendations']),
    };
  }

  private static validateStarAnalysis(parsed: Record<string, unknown>): IStarAnalysis {
    const star = parsed['starAnalysis'] as Record<string, unknown> | undefined;
    if (!star || typeof star !== 'object') {
      throw new GeminiInsightsParseError('Missing or invalid "starAnalysis" in Gemini response');
    }

    return {
      situation: GeminiInsightsService.validateStarSection(star, 'situation'),
      task:      GeminiInsightsService.validateStarSection(star, 'task'),
      action:    GeminiInsightsService.validateActionSection(star),
      result:    GeminiInsightsService.validateStarSection(star, 'result'),
    };
  }

  private static validateStarSection(
    star: Record<string, unknown>,
    key: 'situation' | 'task' | 'result'
  ) {
    const s = star[key] as Record<string, unknown> | undefined ?? {};
    return {
      text:     String(s['text']     ?? ''),
      start:    GeminiInsightsService.toNullableNumber(s['start']),
      end:      GeminiInsightsService.toNullableNumber(s['end']),
      score:    GeminiInsightsService.clampScore(s['score']),
      feedback: String(s['feedback'] ?? ''),
    };
  }

  private static validateActionSection(star: Record<string, unknown>) {
    const a = star['action'] as Record<string, unknown> | undefined ?? {};
    return {
      text:                     String(a['text']     ?? ''),
      start:                    GeminiInsightsService.toNullableNumber(a['start']),
      end:                      GeminiInsightsService.toNullableNumber(a['end']),
      score:                    GeminiInsightsService.clampScore(a['score']),
      feedback:                 String(a['feedback'] ?? ''),
      candidateOwnedAction:     Boolean(a['candidateOwnedAction']    ?? false),
      teamOnlyLanguageDetected: Boolean(a['teamOnlyLanguageDetected'] ?? false),
    };
  }

  private static validateCandidateAssessment(
    parsed: Record<string, unknown>
  ): ICandidateActionAssessment {
    const c = parsed['candidateActionAssessment'] as Record<string, unknown> | undefined ?? {};
    return {
      candidateOwnedActionScore: GeminiInsightsService.clampScore(c['candidateOwnedActionScore']),
      usesPersonalAgency:        Boolean(c['usesPersonalAgency']   ?? false),
      teamLanguageDetected:      Boolean(c['teamLanguageDetected']  ?? false),
      feedback:                  String(c['feedback']               ?? ''),
    };
  }

  // ── Type-coercion helpers ─────────────────────────────────────────────────

  private static clampScore(value: unknown): number {
    const n = Number(value);
    if (Number.isNaN(n)) return 0;
    return Math.min(100, Math.max(0, Math.round(n)));
  }

  private static toNullableNumber(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
  }

  private static toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map(String);
  }
}
