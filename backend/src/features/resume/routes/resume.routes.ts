import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../../common/middlewares/asyncHandler.js';
import { ResumeOptimizationService } from '../services/optimizationService.js';
import { ScoringService } from '../services/scoringService.js';
import { ProfessionalDNA } from '../models/professionalDNA.model.js';
import type { OptimizeRequest, AcceptBulletRequest } from '../types/optimization.types.js';

const router = Router();

/**
 * POST /api/resume/optimize
 * Sends Professional DNA bullets + JD to Gemini for ATS-optimized rewrites,
 * and returns the hybrid match score alongside the suggestions.
 */
router.post(
  '/optimize',
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as OptimizeRequest;

    if (!body.professionalDNAId || !body.jobDescription) {
      res.status(400).json({ error: { message: 'professionalDNAId and jobDescription are required' } });
      return;
    }

    if (!body.jobDescription.requiredSkills?.length || !body.jobDescription.coreResponsibilities?.length) {
      res.status(400).json({
        error: { message: 'jobDescription must include requiredSkills and coreResponsibilities' },
      });
      return;
    }

    const result = await ResumeOptimizationService.optimizeResume(body);
    res.json(result);
  }),
);

/**
 * POST /api/resume/accept-bullet
 * Saves a user-approved (and optionally edited) bullet back to ProfessionalDNA.
 */
router.post(
  '/accept-bullet',
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as AcceptBulletRequest;

    if (!body.professionalDNAId || body.experienceIndex === undefined || !body.finalBullet) {
      res.status(400).json({
        error: { message: 'professionalDNAId, experienceIndex, and finalBullet are required' },
      });
      return;
    }

    await ResumeOptimizationService.acceptBullet(body);
    res.json({ success: true });
  }),
);

/**
 * POST /api/resume/score
 * Calculates only the hybrid match score without running bullet optimization.
 */
router.post(
  '/score',
  asyncHandler(async (req: Request, res: Response) => {
    const { professionalDNAId, jobDescription } = req.body;

    if (!professionalDNAId || !jobDescription) {
      res.status(400).json({ error: { message: 'professionalDNAId and jobDescription are required' } });
      return;
    }

    const dna = await ProfessionalDNA.findById(professionalDNAId);
    if (!dna) {
      res.status(404).json({ error: { message: 'ProfessionalDNA not found' } });
      return;
    }

    const hardRuleOnly = ScoringService.calculateHardRuleMatch(dna, jobDescription);
    res.json({ hardRuleMatch: hardRuleOnly });
  }),
);

export default router;
