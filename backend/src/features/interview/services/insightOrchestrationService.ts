import { Types } from 'mongoose';
import {
  InterviewInsights,
  type IInterviewInsights,
  type InsightsStatus,
} from '../models/interviewInsights.model.js';
import { FillerWordService } from './fillerWordService.js';
import { PacingService }     from './pacingService.js';
import { GeminiInsightsService, GeminiInsightsParseError } from './geminiInsightsService.js';
import { appLogger } from '../../../common/services/logger.js';

// ─── Errors ───────────────────────────────────────────────────────────────────

export class InsightInterviewNotFoundError extends Error {
  constructor(id: string) {
    super(`Interview not found: ${id}`);
    this.name = 'InsightInterviewNotFoundError';
  }
}

export class InsightOwnershipError extends Error {
  constructor() {
    super('You do not have permission to analyse this interview');
    this.name = 'InsightOwnershipError';
  }
}

export class InsightNoTranscriptError extends Error {
  constructor() {
    super('Interview has no transcript — run transcription first');
    this.name = 'InsightNoTranscriptError';
  }
}

export class InsightAlreadyAnalyzingError extends Error {
  constructor() {
    super('Insight analysis is already in progress for this interview');
    this.name = 'InsightAlreadyAnalyzingError';
  }
}

// ─── Options ──────────────────────────────────────────────────────────────────

export interface AnalyseOptions {
  /**
   * When true, re-run analysis even if insights already exist.
   * Default: false (idempotent).
   */
  force?: boolean;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Orchestrates the Gemini insight pipeline for a single interview record.
 *
 * Flow:
 *   not_started / failed → analyzing → completed
 *
 * Runs fire-and-forget from the route handler (same pattern as
 * TranscriptionOrchestrationService) — HTTP response is not blocked.
 *
 * insightsError is stored internally only; never returned to the frontend.
 */
export class InsightOrchestrationService {
  /**
   * Validate ownership + idempotency, set insightsStatus to 'analyzing',
   * then launch the pipeline fire-and-forget.
   */
  static async analyseInterview(
    interviewId:      string,
    requestingUserId: string,
    options:          AnalyseOptions = {}
  ): Promise<void> {
    // ── 1. Load record ──────────────────────────────────────────────────────
    const interview = await InterviewInsights.findById(interviewId);
    if (!interview) {
      throw new InsightInterviewNotFoundError(interviewId);
    }

    // ── 2. Ownership ────────────────────────────────────────────────────────
    if (interview.userId.toString() !== requestingUserId) {
      throw new InsightOwnershipError();
    }

    // ── 3. Guard against concurrent analysis ────────────────────────────────
    if (interview.insightsStatus === 'analyzing') {
      throw new InsightAlreadyAnalyzingError();
    }

    // ── 4. Require transcript ────────────────────────────────────────────────
    if (!interview.transcript) {
      throw new InsightNoTranscriptError();
    }

    // ── 5. Idempotency ───────────────────────────────────────────────────────
    if (interview.insightsStatus === 'completed' && !options.force) {
      appLogger.info('[InsightOrchestration] Insights already exist, skipping', { interviewId });
      return;
    }

    // ── 6. Mark as analyzing and fire pipeline ────────────────────────────
    await InsightOrchestrationService.setInsightsStatus(interviewId, 'analyzing');

    InsightOrchestrationService.runPipeline(interview).catch((err: unknown) => {
      appLogger.error('[InsightOrchestration] Unhandled pipeline error', {
        interviewId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  // ── Pipeline ──────────────────────────────────────────────────────────────

  static async runPipeline(interview: IInterviewInsights): Promise<void> {
    const interviewId = interview._id.toString();
    const transcript  = interview.transcript!;

    try {
      const segments             = interview.transcriptSegments ?? [];
      const mediaDurationSeconds = interview.mediaDurationSeconds;

      // ── Stage 1: deterministic metrics ─────────────────────────────────
      const fillerResult = FillerWordService.count(transcript);
      const pacingResult = PacingService.calculate(transcript, segments, mediaDurationSeconds);

      appLogger.info('[InsightOrchestration] Deterministic metrics computed', {
        interviewId,
        fillerCount:    fillerResult.totalCount,
        wordsPerMinute: pacingResult.wordsPerMinute,
      });

      // ── Stage 2: Gemini NLP analysis ────────────────────────────────────
      const geminiResult = await GeminiInsightsService.analyse(
        transcript,
        segments,
        fillerResult.totalCount,
        pacingResult.wordsPerMinute
      );

      // ── Stage 3: merge and save ─────────────────────────────────────────
      await InterviewInsights.findByIdAndUpdate(interviewId, {
        insightsStatus:                   'completed',
        fillerWordCount:                  fillerResult.totalCount,
        fillerWordsBreakdown:             fillerResult.breakdown,
        wordsPerMinute:                   pacingResult.wordsPerMinute,
        estimatedSpeakingDurationSeconds: pacingResult.estimatedSpeakingDurationSeconds,
        confidenceScore:                  geminiResult.confidenceScore,
        starAnalysis:                     geminiResult.starAnalysis,
        candidateActionAssessment:        geminiResult.candidateActionAssessment,
        strengths:                        geminiResult.strengths,
        weaknesses:                       geminiResult.weaknesses,
        recommendations:                  geminiResult.recommendations,
        geminiProvider:                   geminiResult.provider,
        geminiModel:                      geminiResult.model,
        insightsCompletedAt:              new Date(),
        // Clear any previous insights error
        $unset: { insightsError: '' },
      });

      appLogger.info('[InsightOrchestration] Insights saved', { interviewId });

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const stage   = err instanceof GeminiInsightsParseError ? 'parsing' : 'analyzing';

      appLogger.error('[InsightOrchestration] Pipeline failed', {
        interviewId,
        stage,
        error: message,
      });

      await InterviewInsights.findByIdAndUpdate(interviewId, {
        insightsStatus: 'failed',
        insightsError:  { stage, message },
      });
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private static async setInsightsStatus(
    interviewId:    string,
    insightsStatus: InsightsStatus
  ): Promise<void> {
    await InterviewInsights.findByIdAndUpdate(interviewId, { insightsStatus });
    appLogger.info('[InsightOrchestration] insightsStatus updated', {
      interviewId,
      insightsStatus,
    });
  }

  /**
   * Convenience loader for route handlers — null instead of throwing.
   */
  static async findByIdAndUser(
    interviewId: string,
    userId:      string
  ): Promise<IInterviewInsights | null> {
    if (!Types.ObjectId.isValid(interviewId)) return null;
    return InterviewInsights.findOne({
      _id:    new Types.ObjectId(interviewId),
      userId: new Types.ObjectId(userId),
    });
  }
}
