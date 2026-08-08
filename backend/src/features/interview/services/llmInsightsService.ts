import { createLLMClient } from '../../../common/services/llmClientFactory.js';
import { resolveModelForModule } from '../../../common/services/llmModuleConfig.js';
import type { LLMClient } from '../../../common/services/llmClient.js';
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

export interface LLMInsightsResult {
  starAnalysis:              IStarAnalysis;
  candidateActionAssessment: ICandidateActionAssessment;
  confidenceScore:           number;
  strengths:                 string[];
  weaknesses:                string[];
  recommendations:           string[];
  /** Model identifier used, for provenance tracking. */
  model:                     string;
  /** Provider identifier. */
  provider:                  'colman-llm';
}

// ─── Validation error ─────────────────────────────────────────────────────────

export class LLMInsightsParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMInsightsParseError';
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Calls the LLM to generate STAR-based interview insights.
 *
 * Follows the same static-class, lazy-singleton pattern as the other AI
 * features (HybridScoringService, LLMOptimizationService, AIAnalysisService) —
 * resolves its client through the shared createLLMClient() factory rather than
 * talking to a provider directly, so swapping the underlying LLM provider
 * never requires touching this file.
 */
export class LLMInsightsService {
  private static llmClient: LLMClient | null = null;

  private static getClient(): LLMClient {
    if (!LLMInsightsService.llmClient) {
      LLMInsightsService.llmClient = createLLMClient({
        model: resolveModelForModule('interview'),
        temperature: 0.2,
        maxOutputTokens: 8_192,
      });
    }
    return LLMInsightsService.llmClient;
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
  ): Promise<LLMInsightsResult> {
    const client = LLMInsightsService.getClient();

    const userMessage = buildInterviewInsightsPrompt(
      transcript,
      segments,
      fillerCount,
      wordsPerMinute
    );

    appLogger.info('[LLMInsightsService] Sending transcript for analysis', {
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

    appLogger.info('[LLMInsightsService] Raw response received', {
      responseLength: rawResponse.length,
    });

    const parsed = LLMInsightsService.parseAndValidate(rawResponse);

    return { ...parsed, model: client.model, provider: 'colman-llm' };
  }

  // ── Parsing & validation ──────────────────────────────────────────────────

  /**
   * Parse and structurally validate the raw JSON string from the LLM.
   * Throws LLMInsightsParseError on any parse or validation failure.
   */
  static parseAndValidate(raw: string): Omit<LLMInsightsResult, 'model' | 'provider'> {
    // Strip markdown code fences if the model added them despite instructions
    let cleaned = raw.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      throw new LLMInsightsParseError(
        `LLM returned invalid JSON. Preview: ${raw.slice(0, 200)}`
      );
    }

    return {
      starAnalysis:              LLMInsightsService.validateStarAnalysis(parsed),
      candidateActionAssessment: LLMInsightsService.validateCandidateAssessment(parsed),
      confidenceScore:           LLMInsightsService.clampScore(parsed['confidenceScore']),
      strengths:                 LLMInsightsService.toStringArray(parsed['strengths']),
      weaknesses:                LLMInsightsService.toStringArray(parsed['weaknesses']),
      recommendations:           LLMInsightsService.toStringArray(parsed['recommendations']),
    };
  }

  private static validateStarAnalysis(parsed: Record<string, unknown>): IStarAnalysis {
    const star = parsed['starAnalysis'] as Record<string, unknown> | undefined;
    if (!star || typeof star !== 'object') {
      throw new LLMInsightsParseError('Missing or invalid "starAnalysis" in LLM response');
    }

    return {
      situation: LLMInsightsService.validateStarSection(star, 'situation'),
      task:      LLMInsightsService.validateStarSection(star, 'task'),
      action:    LLMInsightsService.validateActionSection(star),
      result:    LLMInsightsService.validateStarSection(star, 'result'),
    };
  }

  private static validateStarSection(
    star: Record<string, unknown>,
    key: 'situation' | 'task' | 'result'
  ) {
    const s = star[key] as Record<string, unknown> | undefined ?? {};
    return {
      text:     String(s['text']     ?? ''),
      start:    LLMInsightsService.toNullableNumber(s['start']),
      end:      LLMInsightsService.toNullableNumber(s['end']),
      score:    LLMInsightsService.clampScore(s['score']),
      feedback: String(s['feedback'] ?? ''),
    };
  }

  private static validateActionSection(star: Record<string, unknown>) {
    const a = star['action'] as Record<string, unknown> | undefined ?? {};
    return {
      text:                     String(a['text']     ?? ''),
      start:                    LLMInsightsService.toNullableNumber(a['start']),
      end:                      LLMInsightsService.toNullableNumber(a['end']),
      score:                    LLMInsightsService.clampScore(a['score']),
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
      candidateOwnedActionScore: LLMInsightsService.clampScore(c['candidateOwnedActionScore']),
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
