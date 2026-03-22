import { Router, Request, Response } from 'express';
import { ResumeOptimizationService } from '../services/resumeOptimizationService.js';
import { GeminiOptimizationService } from '../services/geminiOptimizationService.js';
import { HybridScoringService } from '../services/hybridScoringService.js';
import { appLogger } from '../../../common/services/logger.js';

const router = Router();

/**
 * POST /api/resume/optimize
 * Accepts a Job Description (text) and a userId, runs the full
 * optimization pipeline: JD ingestion → keyword extraction →
 * alignment → Gemini optimization → hybrid scoring.
 */
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

    res.status(200).json({ success: true, data: dashboardData });
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

/**
 * POST /api/resume/score
 * Returns just the hybrid score without full bullet optimization.
 * Useful for a quick compatibility check.
 */
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

export default router;
