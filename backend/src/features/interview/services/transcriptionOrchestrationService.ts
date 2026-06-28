import { Types } from 'mongoose';
import {
  InterviewInsights,
  type IInterviewInsights,
  type InterviewProcessingStatus,
} from '../models/interviewInsights.model.js';
import { downloadToTempFile, cleanupTempFile } from '../../../common/services/s3Upload.js';
import { AudioExtractionService } from './audioExtractionService.js';
import { WhisperClient } from '../../../common/services/whisperClient.js';
import { appLogger } from '../../../common/services/logger.js';

// ─── Errors ───────────────────────────────────────────────────────────────────

export class InterviewNotFoundError extends Error {
  constructor(interviewId: string) {
    super(`Interview not found: ${interviewId}`);
    this.name = 'InterviewNotFoundError';
  }
}

export class InterviewOwnershipError extends Error {
  constructor() {
    super('You do not have permission to process this interview');
    this.name = 'InterviewOwnershipError';
  }
}

export class InterviewAlreadyProcessingError extends Error {
  constructor(status: string) {
    super(`Interview is already being processed (status: ${status})`);
    this.name = 'InterviewAlreadyProcessingError';
  }
}

export class InterviewMissingMediaKeyError extends Error {
  constructor() {
    super('Interview record has no media file key — cannot transcribe');
    this.name = 'InterviewMissingMediaKeyError';
  }
}

// ─── Options ──────────────────────────────────────────────────────────────────

export interface TranscribeOptions {
  /**
   * When true, re-transcribe even if a transcript already exists.
   * Default: false (idempotent).
   */
  force?: boolean;
}

// ─── Orchestration service ────────────────────────────────────────────────────

/**
 * Drives the full transcription pipeline for a single interview record.
 *
 * Stages:
 *   queued → downloading → [extracting_audio] → transcribing → completed
 *
 * Any unhandled error transitions the record to `failed` and stores an
 * internal `processingError` that is never returned to the frontend.
 *
 * There is no message queue in this codebase; callers fire this method
 * without await (fire-and-forget) so HTTP responses are not blocked.
 */
export class TranscriptionOrchestrationService {
  /**
   * Entry point. Validates ownership, checks idempotency, then runs the pipeline.
   *
   * @param interviewId  MongoDB ObjectId string of the interview.
   * @param requestingUserId  The user making the request (from x-user-id header).
   * @param options      Optional flags.
   */
  static async transcribeInterview(
    interviewId: string,
    requestingUserId: string,
    options: TranscribeOptions = {}
  ): Promise<void> {
    // ── 1. Load record ──────────────────────────────────────────────────────
    const interview = await InterviewInsights.findById(interviewId);
    if (!interview) {
      throw new InterviewNotFoundError(interviewId);
    }

    // ── 2. Ownership check ──────────────────────────────────────────────────
    if (interview.userId.toString() !== requestingUserId) {
      throw new InterviewOwnershipError();
    }

    // ── 3. Guard against concurrent processing ──────────────────────────────
    const activeStatuses: InterviewProcessingStatus[] = [
      'queued', 'downloading', 'extracting_audio', 'transcribing',
    ];
    if (activeStatuses.includes(interview.processingStatus)) {
      throw new InterviewAlreadyProcessingError(interview.processingStatus);
    }

    // ── 4. Idempotency — skip if already transcribed unless forced ──────────
    if (interview.transcript && !options.force) {
      appLogger.info('[TranscriptionOrchestration] Transcript already exists, skipping', {
        interviewId,
      });
      return;
    }

    // ── 5. Validate media key ───────────────────────────────────────────────
    if (!interview.mediaFileKey) {
      throw new InterviewMissingMediaKeyError();
    }

    // ── 6. Mark as queued and hand off to the async pipeline ────────────────
    await TranscriptionOrchestrationService.setStatus(interview, 'queued', {
      processingStartedAt: new Date(),
    });

    // Fire-and-forget — consistent with AssignmentService.runAnalysisPipeline
    TranscriptionOrchestrationService.runPipeline(interview).catch((err: unknown) => {
      appLogger.error('[TranscriptionOrchestration] Unhandled pipeline error', {
        interviewId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  // ── Pipeline ──────────────────────────────────────────────────────────────

  private static async runPipeline(interview: IInterviewInsights): Promise<void> {
    const interviewId = interview._id.toString();
    let tempMediaPath:  string | null = null;
    let tempAudioPath:  string | null = null;
    let audioExtracted = false;

    try {
      // ── Stage: downloading ────────────────────────────────────────────────
      await TranscriptionOrchestrationService.setStatus(interview, 'downloading');

      const mediaExt = TranscriptionOrchestrationService.extensionFromKey(interview.mediaFileKey);
      tempMediaPath = await downloadToTempFile(interview.mediaFileKey, mediaExt);

      appLogger.info('[TranscriptionOrchestration] Media downloaded', {
        interviewId,
        tempMediaPath,
        mediaType: interview.mediaType,
      });

      // ── Stage: extracting_audio (video files only) ────────────────────────
      let audioPath = tempMediaPath;

      if (interview.mediaType === 'video') {
        await TranscriptionOrchestrationService.setStatus(interview, 'extracting_audio');

        const extractionResult = await AudioExtractionService.extractAudio(
          tempMediaPath,
          TranscriptionOrchestrationService.mimeTypeFromKey(interview.mediaFileKey)
        );

        audioPath     = extractionResult.audioPath;
        audioExtracted = extractionResult.extracted;

        if (audioExtracted) {
          tempAudioPath = audioPath;
        }

        appLogger.info('[TranscriptionOrchestration] Audio extracted', {
          interviewId,
          audioPath,
          extracted: audioExtracted,
        });
      }

      // ── Stage: transcribing ───────────────────────────────────────────────
      await TranscriptionOrchestrationService.setStatus(interview, 'transcribing');

      const transcribeStart = Date.now();
      const result = await WhisperClient.transcribe(audioPath);
      const transcriptionDurationMs = Date.now() - transcribeStart;

      // ── Save transcript to MongoDB ────────────────────────────────────────
      await InterviewInsights.findByIdAndUpdate(interviewId, {
        processingStatus:        'completed',
        transcript:              result.text,
        transcriptSegments:      result.segments,
        transcriptionProvider:   result.provider,
        transcriptionModel:      result.model,
        transcriptionLanguage:   result.language,
        transcriptionDurationMs,
        mediaDurationSeconds:    result.durationSeconds,
        transcriptionCompletedAt: new Date(),
        // Also keep the legacy field in sync for backward compat
        status: 'completed',
      });

      appLogger.info('[TranscriptionOrchestration] Transcription saved', {
        interviewId,
        textLength:           result.text.length,
        segmentCount:         result.segments.length,
        transcriptionDurationMs,
      });

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const stage   = TranscriptionOrchestrationService.detectStage(interview.processingStatus);

      appLogger.error('[TranscriptionOrchestration] Pipeline failed', {
        interviewId,
        stage,
        error: message,
      });

      await InterviewInsights.findByIdAndUpdate(interviewId, {
        processingStatus: 'failed',
        status:           'failed',
        processingError:  { stage, message },
      });

    } finally {
      // Always clean up temp files
      if (tempMediaPath) {
        cleanupTempFile(tempMediaPath);
      }
      if (tempAudioPath && audioExtracted) {
        await AudioExtractionService.cleanupAudioFile(tempAudioPath);
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private static async setStatus(
    interview: IInterviewInsights,
    status: InterviewProcessingStatus,
    extra: Record<string, unknown> = {}
  ): Promise<void> {
    interview.processingStatus = status;
    await InterviewInsights.findByIdAndUpdate(interview._id, {
      processingStatus: status,
      ...extra,
    });

    appLogger.info('[TranscriptionOrchestration] Status updated', {
      interviewId: interview._id.toString(),
      status,
    });
  }

  /** Map an S3 key's extension to a file extension string (without dot). */
  private static extensionFromKey(key: string): string {
    const parts = key.split('.');
    return parts.length > 1 ? (parts.at(-1) ?? '') : '';
  }

  /**
   * Best-effort MIME type from the S3 key extension.
   * Used to decide whether audio extraction is needed.
   */
  private static mimeTypeFromKey(key: string): string {
    const ext = TranscriptionOrchestrationService.extensionFromKey(key).toLowerCase();
    const map: Record<string, string> = {
      mp4: 'video/mp4',
      mov: 'video/quicktime',
      avi: 'video/x-msvideo',
      webm: 'video/webm',
      mkv: 'video/x-matroska',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      flac: 'audio/flac',
      m4a: 'audio/mp4',
    };
    return map[ext] ?? 'application/octet-stream';
  }

  /** Return the current stage label for error recording. */
  private static detectStage(status: InterviewProcessingStatus): string {
    return status;
  }

  /**
   * Convenience loader for route handlers — returns null instead of throwing.
   */
  static async findByIdAndUser(
    interviewId: string,
    userId: string
  ): Promise<IInterviewInsights | null> {
    if (!Types.ObjectId.isValid(interviewId)) return null;
    return InterviewInsights.findOne({
      _id:    new Types.ObjectId(interviewId),
      userId: new Types.ObjectId(userId),
    });
  }
}
