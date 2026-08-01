import { Router } from 'express';
import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { asyncHandler } from '../../../common/middlewares/asyncHandler.js';
import { appLogger } from '../../../common/services/logger.js';
import { InterviewInsights } from '../models/interviewInsights.model.js';
import { fetchBlobAsBuffer } from '../../../common/services/s3Upload.js';
import {
  TranscriptionOrchestrationService,
  InterviewNotFoundError,
  InterviewOwnershipError,
  InterviewAlreadyProcessingError,
  InterviewMissingMediaKeyError,
} from '../services/transcriptionOrchestrationService.js';
import {
  InsightOrchestrationService,
  InsightInterviewNotFoundError,
  InsightOwnershipError,
  InsightNoTranscriptError,
  InsightAlreadyAnalyzingError,
} from '../services/insightOrchestrationService.js';

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
      insightsStatus:   interview.insightsStatus,
      hasTranscript:    !!interview.transcript,
      hasInsights:      interview.insightsStatus === 'completed',
      createdAt:              interview.createdAt,
      updatedAt:              interview.updatedAt,
      processingStartedAt:    interview.processingStartedAt    ?? null,
      transcriptionCompletedAt: interview.transcriptionCompletedAt ?? null,
      insightsCompletedAt:    interview.insightsCompletedAt    ?? null,
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

// ─── POST /interviews/:id/analyze ────────────────────────────────────────────

/**
 * Trigger Gemini insight analysis for an interview that already has a transcript.
 * Returns 202 immediately; analysis runs asynchronously.
 */
router.post(
  '/:id/analyze',
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

    const force = asString(req.query.force as string | string[] ?? '') === 'true';

    try {
      await InsightOrchestrationService.analyseInterview(interviewId, userId, { force });

      appLogger.info('[interview-api] Insight analysis triggered', { interviewId, userId });

      const interview = await InsightOrchestrationService.findByIdAndUser(interviewId, userId);
      res.status(202).json({
        interviewId,
        processingStatus: interview?.processingStatus ?? 'completed',
        insightsStatus:   'analyzing',
        message:          'Insight analysis has been queued and will complete shortly.',
        requestId:        req.requestId ?? '-',
      });

    } catch (err) {
      if (err instanceof InsightInterviewNotFoundError) {
        res.status(404).json({
          error: { code: 'INTERVIEW_NOT_FOUND', message: err.message },
          requestId: req.requestId ?? '-',
        });
        return;
      }
      if (err instanceof InsightOwnershipError) {
        res.status(403).json({
          error: { code: 'FORBIDDEN', message: err.message },
          requestId: req.requestId ?? '-',
        });
        return;
      }
      if (err instanceof InsightNoTranscriptError) {
        res.status(422).json({
          error: { code: 'NO_TRANSCRIPT', message: err.message },
          requestId: req.requestId ?? '-',
        });
        return;
      }
      if (err instanceof InsightAlreadyAnalyzingError) {
        res.status(409).json({
          error: { code: 'ALREADY_ANALYZING', message: err.message },
          requestId: req.requestId ?? '-',
        });
        return;
      }
      throw err;
    }
  })
);

// ─── POST /interviews/:id/process ────────────────────────────────────────────

/**
 * Full pipeline: transcription (if needed) → Gemini insights.
 * Returns 202 immediately; both stages run asynchronously in sequence.
 */
router.post(
  '/:id/process',
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
      interviewId, userId
    );

    if (!interview) {
      res.status(404).json({
        error:     { code: 'INTERVIEW_NOT_FOUND', message: 'Interview not found' },
        requestId: req.requestId ?? '-',
      });
      return;
    }

    const activeTranscriptionStatuses = ['queued', 'downloading', 'extracting_audio', 'transcribing'];
    if (activeTranscriptionStatuses.includes(interview.processingStatus)) {
      res.status(409).json({
        error: {
          code:    'ALREADY_PROCESSING',
          message: `Interview transcription is already in progress (status: ${interview.processingStatus})`,
        },
        requestId: req.requestId ?? '-',
      });
      return;
    }

    if (interview.insightsStatus === 'analyzing') {
      res.status(409).json({
        error: { code: 'ALREADY_ANALYZING', message: 'Insight analysis is already in progress' },
        requestId: req.requestId ?? '-',
      });
      return;
    }

    appLogger.info('[interview-api] Full pipeline triggered', { interviewId, userId });

    // Fire-and-forget full pipeline: transcribe (if needed) then analyse
    (async () => {
      try {
        if (!interview.transcript) {
          // Block inside the async task so analysis starts after transcription
          await new Promise<void>((resolve, reject) => {
            TranscriptionOrchestrationService.transcribeInterview(interviewId, userId)
              .then(resolve)
              .catch(reject);
          });

          // Wait for the background pipeline to finish
          await waitForTranscriptionCompletion(interviewId, 300_000);
        }

        // Re-load to get fresh transcript before analysing
        const fresh = await InterviewInsights.findById(interviewId);
        if (fresh?.transcript) {
          await InsightOrchestrationService.analyseInterview(interviewId, userId);
        } else {
          appLogger.warn('[interview-api] Transcript missing after transcription, skipping insights', {
            interviewId,
          });
        }
      } catch (err: unknown) {
        appLogger.error('[interview-api] Full pipeline error', {
          interviewId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();

    res.status(202).json({
      interviewId,
      processingStatus: interview.transcript ? interview.processingStatus : 'queued',
      insightsStatus:   interview.transcript ? 'analyzing' : 'not_started',
      message:          'Full processing pipeline has been triggered.',
      requestId:        req.requestId ?? '-',
    });
  })
);

// ─── GET /interviews/:id/insights ────────────────────────────────────────────

/**
 * Return full Gemini insights once analysis is complete.
 * Returns 400 with INSIGHTS_NOT_READY if insightsStatus is not 'completed'.
 * insightsError and gemini raw responses are never included.
 */
router.get(
  '/:id/insights',
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

    const interview = await InsightOrchestrationService.findByIdAndUser(interviewId, userId);

    if (!interview) {
      res.status(404).json({
        error:     { code: 'INTERVIEW_NOT_FOUND', message: 'Interview not found' },
        requestId: req.requestId ?? '-',
      });
      return;
    }

    if (interview.insightsStatus !== 'completed') {
      res.status(400).json({
        error: {
          code:           'INSIGHTS_NOT_READY',
          message:        'Insight analysis has not completed yet',
          insightsStatus: interview.insightsStatus,
        },
        requestId: req.requestId ?? '-',
      });
      return;
    }

    res.json({
      interviewId:               interview._id,
      processingStatus:          interview.processingStatus,
      insightsStatus:            interview.insightsStatus,
      fillerWordCount:           interview.fillerWordCount           ?? null,
      fillerWordsBreakdown:      interview.fillerWordsBreakdown      ?? [],
      wordsPerMinute:            interview.wordsPerMinute            ?? null,
      estimatedSpeakingDurationSeconds: interview.estimatedSpeakingDurationSeconds ?? null,
      confidenceScore:           interview.confidenceScore           ?? null,
      starAnalysis:              interview.starAnalysis              ?? null,
      candidateActionAssessment: interview.candidateActionAssessment ?? null,
      strengths:                 interview.strengths                 ?? [],
      weaknesses:                interview.weaknesses                ?? [],
      recommendations:           interview.recommendations           ?? [],
      insightsCompletedAt:       interview.insightsCompletedAt       ?? null,
      requestId: req.requestId ?? '-',
    });
  })
);

// ─── GET /interviews/history ─────────────────────────────────────────────────

/**
 * Return the authenticated user's interview list (newest first).
 * Uses x-user-id header, matching all other protected routes.
 */
router.get(
  '/history',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = resolveUserId(req);
    if (!userId) {
      res.status(401).json({
        error:     { code: 'MISSING_USER_ID', message: 'x-user-id header is required' },
        requestId: req.requestId ?? '-',
      });
      return;
    }

    const limit  = Math.min(parseInt(asString((req.query.limit  as string | string[]) ?? '20'), 10), 100);
    const offset = Math.max(parseInt(asString((req.query.offset as string | string[]) ?? '0'),  10), 0);

    const interviews = await InterviewInsights.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset)
      .select('-processingError -insightsError -transcript -transcriptSegments');

    res.json({
      interviews: interviews.map((i) => ({
        id:               i._id,
        mediaType:        i.mediaType,
        processingStatus: i.processingStatus,
        insightsStatus:   i.insightsStatus,
        jobId:            i.jobId     ?? null,
        jobTitle:         i.jobTitle  ?? null,
        company:          i.company   ?? null,
        confidenceScore:  i.confidenceScore ?? null,
        starAnalysis:     i.starAnalysis    ?? null,
        strengths:        i.strengths       ?? [],
        weaknesses:       i.weaknesses      ?? [],
        recommendations:  i.recommendations ?? [],
        createdAt:        i.createdAt,
        updatedAt:        i.updatedAt,
      })),
      count:     interviews.length,
      requestId: req.requestId ?? '-',
    });
  })
);

// ─── GET /interviews/archive ──────────────────────────────────────────────────

/**
 * Return all completed interviews for the user with full insights embedded.
 * Only returns interviews where insightsStatus === 'completed'.
 */
router.get(
  '/archive',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = resolveUserId(req);
    if (!userId) {
      res.status(401).json({
        error:     { code: 'MISSING_USER_ID', message: 'x-user-id header is required' },
        requestId: req.requestId ?? '-',
      });
      return;
    }

    const limit  = Math.min(parseInt(asString((req.query.limit  as string | string[]) ?? '20'), 10), 100);
    const offset = Math.max(parseInt(asString((req.query.offset as string | string[]) ?? '0'),  10), 0);

    const interviews = await InterviewInsights.find({
      userId,
      insightsStatus: 'completed',
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset)
      .select('-processingError -insightsError -transcript -transcriptSegments');

    res.json({
      interviews: interviews.map((i) => ({
        id:               i._id,
        mediaType:        i.mediaType,
        mediaFileKey:     i.mediaFileKey,
        processingStatus: i.processingStatus,
        insightsStatus:   i.insightsStatus,
        jobId:            i.jobId     ?? null,
        jobTitle:         i.jobTitle  ?? null,
        company:          i.company   ?? null,
        confidenceScore:  i.confidenceScore           ?? null,
        fillerWordCount:  i.fillerWordCount            ?? null,
        wordsPerMinute:   i.wordsPerMinute             ?? null,
        starAnalysis:     i.starAnalysis               ?? null,
        candidateActionAssessment: i.candidateActionAssessment ?? null,
        strengths:        i.strengths                 ?? [],
        weaknesses:       i.weaknesses                ?? [],
        recommendations:  i.recommendations           ?? [],
        insightsCompletedAt: i.insightsCompletedAt    ?? null,
        createdAt:        i.createdAt,
        updatedAt:        i.updatedAt,
      })),
      count:     interviews.length,
      requestId: req.requestId ?? '-',
    });
  })
);

// ─── GET /interviews/:id/media ────────────────────────────────────────────────

/**
 * Stream the raw media file from S3 so the browser video/audio player can
 * load it. Supports the Range header for seeking.
 */
router.get(
  '/:id/media',
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

    const interview = await InterviewInsights.findOne({ _id: interviewId, userId }).select('mediaFileKey mediaType');
    if (!interview) {
      res.status(404).json({
        error:     { code: 'INTERVIEW_NOT_FOUND', message: 'Interview not found' },
        requestId: req.requestId ?? '-',
      });
      return;
    }

    const contentType = interview.mediaType === 'video' ? 'video/mp4' : 'audio/mpeg';

    try {
      const buffer = await fetchBlobAsBuffer(interview.mediaFileKey);
      const total  = buffer.byteLength;
      const rangeHeader = req.headers.range;

      if (rangeHeader) {
        const [startStr, endStr] = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(startStr, 10);
        const end   = endStr ? parseInt(endStr, 10) : total - 1;
        const chunk = buffer.slice(start, end + 1);

        res.status(206).set({
          'Content-Range':  `bytes ${start}-${end}/${total}`,
          'Accept-Ranges':  'bytes',
          'Content-Length': chunk.byteLength.toString(),
          'Content-Type':   contentType,
        });
        res.end(chunk);
      } else {
        res.set({
          'Content-Length': total.toString(),
          'Content-Type':   contentType,
          'Accept-Ranges':  'bytes',
        });
        res.end(buffer);
      }
    } catch (err) {
      appLogger.error('[interview-api] Media stream failed', {
        interviewId,
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({
        error:     { code: 'MEDIA_FETCH_FAILED', message: 'Failed to fetch media file' },
        requestId: req.requestId ?? '-',
      });
    }
  })
);

export default router;

// ─── Internal helper ──────────────────────────────────────────────────────────

/**
 * Poll MongoDB until the interview's processingStatus reaches a terminal
 * state ('completed' or 'failed'). Used by the full-pipeline endpoint so
 * insight analysis doesn't start before transcription finishes.
 */
async function waitForTranscriptionCompletion(
  interviewId: string,
  timeoutMs:   number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const doc = await InterviewInsights.findById(interviewId).select('processingStatus');
    if (doc?.processingStatus === 'completed' || doc?.processingStatus === 'failed') return;
    await new Promise<void>((r) => setTimeout(r, 500));
  }
  appLogger.warn('[interview-api] waitForTranscriptionCompletion timed out', { interviewId });
}
