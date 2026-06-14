import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../../common/middlewares/asyncHandler.js';
import { InterviewService } from '../services/interviewService.js';
import { appLogger } from '../../../common/services/logger.js';

const router = Router();

router.get(
  '/user/:userId',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.params.userId as string;
    const { limit = '10', offset = '0' } = req.query;

    if (!userId) {
      res.status(400).json({
        error: { code: 'MISSING_USER_ID', message: 'User ID is required' },
        requestId: req.requestId ?? '-',
      });
      return;
    }

    const interviews = await InterviewService.getUserInterviews(
      userId,
      parseInt(limit as string, 10),
      parseInt(offset as string, 10)
    );

    res.json({
      interviews: interviews.map((iv) => ({
        id: iv._id,
        mediaFileKey: iv.mediaFileKey,
        mediaType: iv.mediaType,
        status: iv.status,
        jobId: iv.jobId,
        createdAt: iv.createdAt,
        updatedAt: iv.updatedAt,
      })),
      count: interviews.length,
      requestId: req.requestId ?? '-',
    });
  })
);

router.get(
  '/:interviewId/status',
  asyncHandler(async (req: Request, res: Response) => {
    const interviewId = req.params.interviewId as string;

    if (!interviewId) {
      res.status(400).json({
        error: { code: 'MISSING_INTERVIEW_ID', message: 'Interview ID is required' },
        requestId: req.requestId ?? '-',
      });
      return;
    }

    const interview = await InterviewService.getInterview(interviewId);

    if (!interview) {
      res.status(404).json({
        error: { code: 'INTERVIEW_NOT_FOUND', message: 'Interview not found' },
        requestId: req.requestId ?? '-',
      });
      return;
    }

    appLogger.info('[interview-api] Status checked', {
      interviewId,
      status: interview.status,
      requestId: req.requestId,
    });

    res.json({
      interviewId,
      status: interview.status,
      mediaType: interview.mediaType,
      createdAt: interview.createdAt,
      updatedAt: interview.updatedAt,
      requestId: req.requestId ?? '-',
    });
  })
);

router.get(
  '/:interviewId',
  asyncHandler(async (req: Request, res: Response) => {
    const interviewId = req.params.interviewId as string;

    if (!interviewId) {
      res.status(400).json({
        error: { code: 'MISSING_INTERVIEW_ID', message: 'Interview ID is required' },
        requestId: req.requestId ?? '-',
      });
      return;
    }

    const interview = await InterviewService.getInterview(interviewId);

    if (!interview) {
      res.status(404).json({
        error: { code: 'INTERVIEW_NOT_FOUND', message: 'Interview not found' },
        requestId: req.requestId ?? '-',
      });
      return;
    }

    res.json({
      interview: {
        id: interview._id,
        mediaFileKey: interview.mediaFileKey,
        mediaType: interview.mediaType,
        status: interview.status,
        jobId: interview.jobId,
        transcript: interview.transcript,
        insights: interview.insights,
        createdAt: interview.createdAt,
        updatedAt: interview.updatedAt,
      },
      requestId: req.requestId ?? '-',
    });
  })
);

export default router;
