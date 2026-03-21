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
// Upload a resume PDF → Gemini extracts Professional DNA → User + DNA stored.
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
// Full pipeline: ingest → align → Gemini → reconstruct CV → MinIO → MongoDB
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
    const dashboardData = await GeminiOptimizationService.optimizeResume(payload);

    const { artifactKey, downloadUrl, versionTag } =
      await CvReconstructionService.reconstructAndStore(
        userId,
        dashboardData,
        payload.professionalDNA
      );

    const run = await OptimizationRun.create({
      userId: Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : userId,
      jobDescriptionText,
      dashboardData: dashboardData as unknown as Record<string, unknown>,
      artifactKey,
      versionTag,
      downloadUrl,
    });

    appLogger.info('[ResumeOptimization] Run persisted', { runId: run._id, artifactKey });

    res.status(200).json({
      success: true,
      data: dashboardData,
      run: {
        _id: run._id,
        artifactKey,
        versionTag,
        downloadUrl,
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
// List all optimization runs for the given user (newest first).
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
      .select('jobDescriptionText versionTag downloadUrl createdAt dashboardData.hybridScore.finalScore')
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
// Full detail for a single run (user-scoped).
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

// ── GET /api/resume/history/:runId/artifact ─────────────────────
// Stream the reconstructed CV text from MinIO (user-scoped).
router.get('/history/:runId/artifact', async (req: Request, res: Response): Promise<void> => {
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
    })
      .select('artifactKey')
      .lean();

    if (!run) {
      res.status(404).json({ success: false, error: 'Run not found' });
      return;
    }

    const text = await CvReconstructionService.fetchArtifact(run.artifactKey);

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="optimized-cv-${runId}.md"`
    );
    res.status(200).send(text);
  } catch (err) {
    appLogger.error('[ResumeOptimization] Artifact fetch failed', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
    res.status(500).json({ success: false, error: 'Failed to fetch artifact' });
  }
});

// ── DELETE /api/resume/history/:runId ────────────────────────────
// Delete the run from MongoDB AND its artifact from MinIO.
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

    try {
      await CvReconstructionService.deleteArtifact(run.artifactKey);
    } catch (cleanupErr) {
      appLogger.warn('[ResumeOptimization] MinIO cleanup failed (orphan possible)', {
        artifactKey: run.artifactKey,
        error: cleanupErr instanceof Error ? cleanupErr.message : 'Unknown',
      });
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
