import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import multer from 'multer';
import { ResumeOptimizationService } from '../services/resumeOptimizationService.js';
import { GeminiOptimizationService } from '../services/geminiOptimizationService.js';
import { HybridScoringService } from '../services/hybridScoringService.js';
import { CvReconstructionService } from '../services/cvReconstructionService.js';
import { ResumeParsingService } from '../services/resumeParsingService.js';
import { OptimizationRun } from '../models/optimizationRun.model.js';
import { appLogger } from '../../../common/services/logger.js';

const router = Router();

const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype === 'application/pdf');
  },
});

// ── POST /api/resume/upload ─────────────────────────────────────
router.post(
  '/upload',
  resumeUpload.single('resume'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: 'A PDF file is required (field: "resume")' });
        return;
      }

      const existingUserId = req.body.userId as string | undefined;

      appLogger.info('[ResumeUpload] Parsing uploaded resume', {
        size: req.file.size,
        existingUserId: existingUserId || 'none',
      });

      const result = await ResumeParsingService.parseAndStore(
        req.file.buffer,
        existingUserId
      );

      res.status(201).json({ success: true, data: result });
    } catch (err) {
      appLogger.error('[ResumeUpload] Upload failed', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Resume upload failed',
      });
    }
  }
);

// ── POST /api/resume/optimize ───────────────────────────────────
router.post('/optimize', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, jobDescriptionText } = req.body;

    if (!userId || typeof userId !== 'string') {
      res.status(400).json({ success: false, error: 'userId is required' });
      return;
    }
    if (!jobDescriptionText || typeof jobDescriptionText !== 'string') {
      res.status(400).json({ success: false, error: 'jobDescriptionText is required' });
      return;
    }

    appLogger.info('[ResumeOptimization] Starting optimization pipeline', { userId });

    const payload = await ResumeOptimizationService.prepareFromText(userId, jobDescriptionText);

    const originalResumeText = payload.professionalDNA.rawResumeText?.trim();
    if (!originalResumeText) {
      appLogger.info('[ResumeOptimization] Aborted — user has no resume on file', { userId });
      res.status(400).json({
        success: false,
        error: {
          code: 'RESUME_NOT_UPLOADED',
          message: 'Please upload your resume before running an optimization.',
        },
      });
      return;
    }

    const dashboardData = await GeminiOptimizationService.optimizeResume(payload);

    const versionTag = Date.now().toString(36);

    const run = await OptimizationRun.create({
      userId: Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : userId,
      jobDescriptionText,
      dashboardData: dashboardData as unknown as Record<string, unknown>,
      originalResumeText,
      versionTag,
    });

    appLogger.info('[ResumeOptimization] Run persisted', { runId: run._id });

    res.status(200).json({
      success: true,
      data: dashboardData,
      run: {
        _id: run._id,
        versionTag,
        createdAt: run.createdAt,
      },
    });
  } catch (err) {
    appLogger.error('[ResumeOptimization] Optimization failed', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Optimization failed',
    });
  }
});

// ── POST /api/resume/score ──────────────────────────────────────
router.post('/score', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, jobDescriptionText } = req.body;

    if (!userId || typeof userId !== 'string') {
      res.status(400).json({ success: false, error: 'userId is required' });
      return;
    }
    if (!jobDescriptionText || typeof jobDescriptionText !== 'string') {
      res.status(400).json({ success: false, error: 'jobDescriptionText is required' });
      return;
    }

    const payload = await ResumeOptimizationService.prepareFromText(userId, jobDescriptionText);
    const hybridScore = await HybridScoringService.calculateHybridScore(payload);

    res.status(200).json({ success: true, data: hybridScore });
  } catch (err) {
    appLogger.error('[ResumeOptimization] Scoring failed', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Scoring failed',
    });
  }
});

// ── GET /api/resume/history ─────────────────────────────────────
router.get('/history', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      res.status(400).json({ success: false, error: 'userId query param is required' });
      return;
    }

    const runs = await OptimizationRun.find(
      Types.ObjectId.isValid(userId)
        ? { userId: new Types.ObjectId(userId) }
        : { userId }
    )
      .sort({ createdAt: -1 })
      .select('jobDescriptionText versionTag createdAt dashboardData.hybridScore.finalScore')
      .lean();

    res.status(200).json({ success: true, data: runs });
  } catch (err) {
    appLogger.error('[ResumeOptimization] History list failed', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
    res.status(500).json({ success: false, error: 'Failed to fetch history' });
  }
});

// ── GET /api/resume/history/:runId ──────────────────────────────
router.get('/history/:runId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { runId } = req.params;
    const userId = req.query.userId as string;
    if (!userId) {
      res.status(400).json({ success: false, error: 'userId query param is required' });
      return;
    }

    const run = await OptimizationRun.findOne({
      _id: runId,
      userId: Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : userId,
    }).lean();

    if (!run) {
      res.status(404).json({ success: false, error: 'Run not found' });
      return;
    }

    res.status(200).json({ success: true, data: run });
  } catch (err) {
    appLogger.error('[ResumeOptimization] History detail failed', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
    res.status(500).json({ success: false, error: 'Failed to fetch run' });
  }
});

// ── POST /api/resume/history/:runId/artifact ────────────────────
// Generate the optimized CV on-demand: take the user's original resume
// and replace ONLY the accepted/edited bullets.
router.post('/history/:runId/artifact', async (req: Request, res: Response): Promise<void> => {
  try {
    const { runId } = req.params;
    const { userId, acceptedBullets } = req.body as {
      userId: string;
      acceptedBullets: Array<{ originalBullet: string; optimizedBullet: string; userEdit?: string }>;
    };

    if (!userId) {
      res.status(400).json({ success: false, error: 'userId is required' });
      return;
    }

    const run = await OptimizationRun.findOne({
      _id: runId,
      userId: Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : userId,
    }).lean();

    if (!run) {
      res.status(404).json({ success: false, error: 'Run not found' });
      return;
    }

    const finalText = CvReconstructionService.applyAcceptedChanges(
      run.originalResumeText,
      acceptedBullets || []
    );

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="optimized-cv-${runId}.txt"`
    );
    res.status(200).send(finalText);
  } catch (err) {
    appLogger.error('[ResumeOptimization] Artifact generation failed', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
    res.status(500).json({ success: false, error: 'Failed to generate artifact' });
  }
});

// ── DELETE /api/resume/history/:runId ────────────────────────────
router.delete('/history/:runId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { runId } = req.params;
    const userId = req.query.userId as string;
    if (!userId) {
      res.status(400).json({ success: false, error: 'userId query param is required' });
      return;
    }

    const run = await OptimizationRun.findOneAndDelete({
      _id: runId,
      userId: Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : userId,
    }).lean();

    if (!run) {
      res.status(404).json({ success: false, error: 'Run not found' });
      return;
    }

    if (run.artifactKey) {
      try {
        await CvReconstructionService.deleteArtifact(run.artifactKey);
      } catch (cleanupErr) {
        appLogger.warn('[ResumeOptimization] MinIO cleanup failed (orphan possible)', {
          artifactKey: run.artifactKey,
          error: cleanupErr instanceof Error ? cleanupErr.message : 'Unknown',
        });
      }
    }

    res.status(200).json({ success: true, deleted: runId });
  } catch (err) {
    appLogger.error('[ResumeOptimization] Delete failed', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
    res.status(500).json({ success: false, error: 'Failed to delete run' });
  }
});

export default router;
