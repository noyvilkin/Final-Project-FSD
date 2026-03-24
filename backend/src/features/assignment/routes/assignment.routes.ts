import { Router } from 'express';
import { asyncHandler } from '../../../common/middlewares/asyncHandler.js';
import { AssignmentService } from '../services/assignmentService.js';
import { ResultsService } from '../services/resultsService.js';
import { appLogger } from '../../../common/services/logger.js';
import type { Request, Response } from 'express';

const router = Router();

/**
 * Get assignment by ID
 */
router.get(
  '/:assignmentId',
  asyncHandler(async (req: Request, res: Response) => {
    const assignmentId = req.params.assignmentId as string;
    
    if (!assignmentId) {
      res.status(400).json({
        error: {
          code: 'MISSING_ASSIGNMENT_ID',
          message: 'Assignment ID is required'
        },
        requestId: req.requestId ?? '-'
      });
      return;
    }

    const assignment = await AssignmentService.getAssignment(assignmentId);
    
    if (!assignment) {
      res.status(404).json({
        error: {
          code: 'ASSIGNMENT_NOT_FOUND',
          message: 'Assignment not found'
        },
        requestId: req.requestId ?? '-'
      });
      return;
    }

    res.json({
      assignment: {
        id: assignment._id,
        status: assignment.status,
        requirementsFileKey: assignment.requirementsFileKey,
        solutionFileKey: assignment.solutionFileKey,
        userNotes: assignment.userNotes,
        metadata: assignment.metadata,
        feedback: assignment.feedback,
        createdAt: assignment.createdAt,
        updatedAt: assignment.updatedAt
      },
      requestId: req.requestId ?? '-'
    });
  })
);

/**
 * Get assignments for a user
 */
router.get(
  '/user/:userId',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.params.userId as string;
    const { limit = '10', offset = '0' } = req.query;
    
    if (!userId) {
      res.status(400).json({
        error: {
          code: 'MISSING_USER_ID',
          message: 'User ID is required'
        },
        requestId: req.requestId ?? '-'
      });
      return;
    }

    const assignments = await AssignmentService.getUserAssignments(
      userId,
      parseInt(limit as string, 10),
      parseInt(offset as string, 10)
    );

    res.json({
      assignments: assignments.map(assignment => ({
        id: assignment._id,
        status: assignment.status,
        requirementsFileKey: assignment.requirementsFileKey,
        solutionFileKey: assignment.solutionFileKey,
        userNotes: assignment.userNotes,
        metadata: assignment.metadata,
        feedback: assignment.feedback,
        createdAt: assignment.createdAt,
        updatedAt: assignment.updatedAt
      })),
      count: assignments.length,
      requestId: req.requestId ?? '-'
    });
  })
);

/**
 * Update assignment status (for internal use or admin)
 */
router.patch(
  '/:assignmentId/status',
  asyncHandler(async (req: Request, res: Response) => {
    const assignmentId = req.params.assignmentId as string;
    const { status, metadata } = req.body;
    
    if (!assignmentId || !status) {
      res.status(400).json({
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'Assignment ID and status are required'
        },
        requestId: req.requestId ?? '-'
      });
      return;
    }

    const validStatuses = ['pending', 'scanning', 'processing', 'completed', 'failed'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({
        error: {
          code: 'INVALID_STATUS',
          message: `Status must be one of: ${validStatuses.join(', ')}`
        },
        requestId: req.requestId ?? '-'
      });
      return;
    }

    const success = await AssignmentService.updateAssignmentStatus(
      assignmentId,
      status,
      metadata
    );

    if (!success) {
      res.status(404).json({
        error: {
          code: 'UPDATE_FAILED',
          message: 'Failed to update assignment status'
        },
        requestId: req.requestId ?? '-'
      });
      return;
    }

    appLogger.info('Assignment status updated via API', {
      assignmentId,
      status,
      requestId: req.requestId
    });

    res.json({
      success: true,
      assignmentId,
      status,
      requestId: req.requestId ?? '-'
    });
  })
);

/**
 * Get assignment analysis results with AI feedback
 */
router.get(
  '/:assignmentId/results',
  asyncHandler(async (req: Request, res: Response) => {
    const assignmentId = req.params.assignmentId as string;
    const { format = 'summary' } = req.query as { format?: 'summary' | 'detailed' | 'raw' };
    
    if (!assignmentId) {
      res.status(400).json({
        error: {
          code: 'MISSING_ASSIGNMENT_ID',
          message: 'Assignment ID is required'
        },
        requestId: req.requestId ?? '-'
      });
      return;
    }

    const assignment = await AssignmentService.getAssignment(assignmentId);
    
    if (!assignment) {
      res.status(404).json({
        error: {
          code: 'ASSIGNMENT_NOT_FOUND',
          message: 'Assignment not found'
        },
        requestId: req.requestId ?? '-'
      });
      return;
    }

    if (assignment.status !== 'completed' || !assignment.aiFeedback) {
      res.status(400).json({
        error: {
          code: 'RESULTS_NOT_READY',
          message: 'Assignment analysis not yet completed',
          currentStatus: assignment.status,
          statusMessage: ResultsService.getStatusMessage(assignment)
        },
        requestId: req.requestId ?? '-'
      });
      return;
    }

    try {
      const resultsSummary = await ResultsService.generateResultsSummary(assignmentId);

      if (!resultsSummary) {
        res.status(500).json({
          error: {
            code: 'RESULTS_GENERATION_FAILED',
            message: 'Failed to generate results summary'
          },
          requestId: req.requestId ?? '-'
        });
        return;
      }

      let response;
      
      switch (format) {
        case 'raw':
          response = {
            assignmentId,
            status: assignment.status,
            aiFeedback: assignment.aiFeedback,
            metadata: assignment.metadata,
            completedAt: assignment.aiAnalysisCompletedAt,
            requestId: req.requestId ?? '-'
          };
          break;

        case 'detailed':
          response = {
            assignmentId,
            status: assignment.status,
            results: resultsSummary,
            report: ResultsService.formatDetailedReport(resultsSummary),
            requestId: req.requestId ?? '-'
          };
          break;

        case 'summary':
        default:
          response = {
            assignmentId,
            status: assignment.status,
            results: resultsSummary,
            requestId: req.requestId ?? '-'
          };
          break;
      }

      appLogger.info('[assignment-api] Results retrieved', {
        assignmentId,
        format,
        grade: resultsSummary.overallGrade,
        score: resultsSummary.overallScore,
        requestId: req.requestId
      });

      res.json(response);

    } catch (error) {
      appLogger.error('[assignment-api] Failed to get assignment results', {
        assignmentId,
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId: req.requestId
      });

      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve assignment results'
        },
        requestId: req.requestId ?? '-'
      });
    }
  })
);

/**
 * Get detailed assignment status including processing information
 */
router.get(
  '/:assignmentId/status',
  asyncHandler(async (req: Request, res: Response) => {
    const assignmentId = req.params.assignmentId as string;
    
    if (!assignmentId) {
      res.status(400).json({
        error: {
          code: 'MISSING_ASSIGNMENT_ID',
          message: 'Assignment ID is required'
        },
        requestId: req.requestId ?? '-'
      });
      return;
    }

    const assignment = await AssignmentService.getAssignment(assignmentId);
    
    if (!assignment) {
      res.status(404).json({
        error: {
          code: 'ASSIGNMENT_NOT_FOUND',
          message: 'Assignment not found'
        },
        requestId: req.requestId ?? '-'
      });
      return;
    }

    const statusMessage = ResultsService.getStatusMessage(assignment);

    const response = {
      assignmentId,
      status: assignment.status,
      statusMessage,
      createdAt: assignment.createdAt,
      updatedAt: assignment.updatedAt,
      aiAnalysisCompletedAt: assignment.aiAnalysisCompletedAt,
      metadata: assignment.metadata ? {
        detectedLanguage: assignment.metadata.detectedLanguage,
        detectedFrameworks: assignment.metadata.detectedFrameworks,
        totalFiles: assignment.metadata.totalFiles,
        totalLines: assignment.metadata.totalLines
      } : null,
      hasAIResults: !!assignment.aiFeedback,
      overallScore: assignment.aiFeedback?.overall?.score,
      overallGrade: assignment.aiFeedback?.overall?.grade,
      ...(assignment.processingErrors?.length && {
        processingErrors: assignment.processingErrors
      }),
      requestId: req.requestId ?? '-'
    };

    appLogger.info('[assignment-api] Status checked', {
      assignmentId,
      status: assignment.status,
      requestId: req.requestId
    });

    res.json(response);
  })
);

export default router;
