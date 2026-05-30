import { Router } from 'express';
import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { asyncHandler } from '../../../common/middlewares/asyncHandler.js';
import { appLogger } from '../../../common/services/logger.js';
import { InterviewInsights } from '../models/interviewInsights.model.js';
import {
  TranscriptionOrchestrationService,
  InterviewNotFoundError,
  InterviewOwnershipError,
  InterviewAlreadyProcessingError,
  InterviewMissingMediaKeyError,
} from '../services/transcriptionOrchestrationService.js';

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveUserId(req: Request): string | null {
  const raw = req.headers['x-user-id'];
  const id  = Array.isArray(raw) ? raw[0] : raw;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

function isValidObjectId(id: string | string[]): boolean {
  const s = Array.isArray(id) ? id[0] : id;
  return Types.ObjectId.isValid(s);
}

function asString(param: string | string[]): string {
  return Array.isArray(param) ? (param[0] ?? '') : param;
}

// ─── POST /interviews/:id/transcribe ─────────────────────────────────────────

/**
 * Trigger Whisper transcription for an uploaded interview.
 *
 * The orchestration pipeline runs asynchronously — this endpoint returns 202
 * immediately and does not wait for transcription to complete.
 *
 * Auth: x-user-id header (consistent with all other protected routes).
 */
router.post(
  '/:id/transcribe',
  asyncHandler(async (req: Request, res: Response) => {
    const interviewId = asString(req.params.id);
    const userId      = resolveUserId(req);

    if (!userId) {
      res.status(401).json({
        error:     { code: 'MISSING_USER_ID', message: 'x-user-id header is required' },
        requestId: req.requestId ?? '-',
      });
      return;
    }

    if (!isValidObjectId(interviewId)) {
      res.status(400).json({
        error:     { code: 'INVALID_INTERVIEW_ID', message: 'Invalid interview ID format' },
        requestId: req.requestId ?? '-',
      });
      return;
    }

    const forceRetranscribe = asString(req.query.force as string | string[] ?? '') === 'true';

    try {
      // This validates ownership + idempotency, sets status to 'queued', and
      // launches the pipeline fire-and-forget.
      await TranscriptionOrchestrationService.transcribeInterview(
        interviewId,
        userId,
        { force: forceRetranscribe }
      );

      appLogger.info('[interview-api] Transcription triggered', { interviewId, userId });

      res.status(202).json({
        interviewId,
        processingStatus: 'queued',
        message: 'Transcription has been queued and will complete shortly.',
        requestId: req.requestId ?? '-',
      });

    } catch (err) {
      if (err instanceof InterviewNotFoundError) {
        res.status(404).json({
          error:     { code: 'INTERVIEW_NOT_FOUND', message: err.message },
          requestId: req.requestId ?? '-',
        });
        return;
      }
      if (err instanceof InterviewOwnershipError) {
        res.status(403).json({
          error:     { code: 'FORBIDDEN', message: err.message },
          requestId: req.requestId ?? '-',
        });
        return;
      }
      if (err instanceof InterviewAlreadyProcessingError) {
        res.status(409).json({
          error:     { code: 'ALREADY_PROCESSING', message: err.message },
          requestId: req.requestId ?? '-',
        });
        return;
      }
      if (err instanceof InterviewMissingMediaKeyError) {
        res.status(422).json({
          error:     { code: 'MISSING_MEDIA_KEY', message: err.message },
          requestId: req.requestId ?? '-',
        });
        return;
      }
      throw err; // Let errorHandler middleware handle unexpected errors
    }
  })
);

// ─── GET /interviews/:id/status ───────────────────────────────────────────────

/**
 * Lightweight polling endpoint for the transcription pipeline status.
 * Internal `processingError` is never returned.
 */
router.get(
  '/:id/status',
  asyncHandler(async (req: Request, res: Response) => {
    const interviewId = asString(req.params.id);
    const userId      = resolveUserId(req);

    if (!userId) {
      res.status(401).json({
        error:     { code: 'MISSING_USER_ID', message: 'x-user-id header is required' },
        requestId: req.requestId ?? '-',
      });
      return;
    }

    if (!isValidObjectId(interviewId)) {
      res.status(400).json({
        error:     { code: 'INVALID_INTERVIEW_ID', message: 'Invalid interview ID format' },
        requestId: req.requestId ?? '-',
      });
      return;
    }

    const interview = await TranscriptionOrchestrationService.findByIdAndUser(
      interviewId,
      userId
    );

    if (!interview) {
      res.status(404).json({
        error:     { code: 'INTERVIEW_NOT_FOUND', message: 'Interview not found' },
        requestId: req.requestId ?? '-',
      });
      return;
    }

    res.json({
      id:               interview._id,
      processingStatus: interview.processingStatus,
      hasTranscript:    !!interview.transcript,
      hasInsights:      !!interview.insights,
      createdAt:           interview.createdAt,
      updatedAt:           interview.updatedAt,
      processingStartedAt: interview.processingStartedAt ?? null,
      transcriptionCompletedAt: interview.transcriptionCompletedAt ?? null,
      requestId: req.requestId ?? '-',
    });
  })
);

// ─── GET /interviews/:id/transcript ──────────────────────────────────────────

/**
 * Return the full transcript and metadata once transcription is complete.
 * Returns 400 if transcription has not yet finished.
 */
router.get(
  '/:id/transcript',
  asyncHandler(async (req: Request, res: Response) => {
    const interviewId = asString(req.params.id);
    const userId      = resolveUserId(req);

    if (!userId) {
      res.status(401).json({
        error:     { code: 'MISSING_USER_ID', message: 'x-user-id header is required' },
        requestId: req.requestId ?? '-',
      });
      return;
    }

    if (!isValidObjectId(interviewId)) {
      res.status(400).json({
        error:     { code: 'INVALID_INTERVIEW_ID', message: 'Invalid interview ID format' },
        requestId: req.requestId ?? '-',
      });
      return;
    }

    const interview = await TranscriptionOrchestrationService.findByIdAndUser(
      interviewId,
      userId
    );

    if (!interview) {
      res.status(404).json({
        error:     { code: 'INTERVIEW_NOT_FOUND', message: 'Interview not found' },
        requestId: req.requestId ?? '-',
      });
      return;
    }

    if (interview.processingStatus !== 'completed' || !interview.transcript) {
      res.status(400).json({
        error: {
          code:            'TRANSCRIPT_NOT_READY',
          message:         'Transcription has not completed yet',
          processingStatus: interview.processingStatus,
        },
        requestId: req.requestId ?? '-',
      });
      return;
    }

    res.json({
      interviewId:              interview._id,
      transcript:               interview.transcript,
      transcriptSegments:       interview.transcriptSegments ?? [],
      transcriptionProvider:    interview.transcriptionProvider ?? null,
      transcriptionModel:       interview.transcriptionModel ?? null,
      transcriptionLanguage:    interview.transcriptionLanguage ?? null,
      mediaDurationSeconds:     interview.mediaDurationSeconds ?? null,
      transcriptionCompletedAt: interview.transcriptionCompletedAt ?? null,
      requestId: req.requestId ?? '-',
    });
  })
);

// ─── GET /interviews/user/:userId ─────────────────────────────────────────────

/**
 * List all interviews for a user with pagination.
 * Consistent with GET /api/assignments/user/:userId.
 */
router.get(
  '/user/:userId',
  asyncHandler(async (req: Request, res: Response) => {
    const targetUserId     = asString(req.params.userId);
    const requestingUserId = resolveUserId(req);

    if (!requestingUserId) {
      res.status(401).json({
        error:     { code: 'MISSING_USER_ID', message: 'x-user-id header is required' },
        requestId: req.requestId ?? '-',
      });
      return;
    }

    // Users may only list their own interviews
    if (requestingUserId !== targetUserId) {
      res.status(403).json({
        error:     { code: 'FORBIDDEN', message: 'You may only list your own interviews' },
        requestId: req.requestId ?? '-',
      });
      return;
    }

    const limit  = Math.min(parseInt(asString((req.query.limit  as string | string[]) ?? '10'), 10), 50);
    const offset = Math.max(parseInt(asString((req.query.offset as string | string[]) ?? '0'),  10), 0);

    const interviews = await InterviewInsights.find({ userId: targetUserId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset)
      .select('-processingError -insights -transcript -transcriptSegments');

    res.json({
      interviews: interviews.map((i) => ({
        id:              i._id,
        mediaType:       i.mediaType,
        processingStatus: i.processingStatus,
        hasTranscript:   !!i.transcript,
        hasInsights:     !!i.insights,
        createdAt:       i.createdAt,
        updatedAt:       i.updatedAt,
      })),
      count:     interviews.length,
      requestId: req.requestId ?? '-',
    });
  })
);

export default router;
