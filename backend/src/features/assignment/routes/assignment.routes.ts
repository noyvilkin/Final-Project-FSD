import { Router } from 'express';
import { asyncHandler } from '../../../common/middlewares/asyncHandler.js';
import { AssignmentService } from '../services/assignmentService.js';
import { ResultsService } from '../services/resultsService.js';
import { appLogger } from '../../../common/services/logger.js';
import { MAX_ASSIGNMENT_RETRIES, canRetryAssignment } from '../services/assignmentRecovery.js';
import type { Request, Response } from 'express';

const router = Router();

const getRequestUserId = (req: Request): string | undefined => {
  const headerValue = req.headers['x-user-id'];
  return typeof headerValue === 'string' ? headerValue : undefined;
};

const serializeAssignment = (assignment: any) => ({
  id: assignment._id,
  status: assignment.status,
  statusMessage: ResultsService.getStatusMessage(assignment),
  requirementsFileKey: assignment.requirementsFileKey,
  solutionFileKey: assignment.solutionFileKey,
  userNotes: assignment.userNotes,
  metadata: assignment.metadata,
  feedback: assignment.feedback,
  aiFeedback: assignment.aiFeedback,
  recovery: assignment.recovery,
  canRetry: assignment.status === 'failed'
    && (assignment.recovery?.failureCategory ?? 'unknown') !== 'terminal'
    && canRetryAssignment(
      assignment.recovery?.retryCount ?? 0,
      assignment.recovery?.maxRetryCount ?? MAX_ASSIGNMENT_RETRIES
    ),
  canReanalyze: ['completed', 'failed'].includes(assignment.status) && !assignment.recovery?.activeRunId,
  createdAt: assignment.createdAt,
  updatedAt: assignment.updatedAt,
  aiAnalysisCompletedAt: assignment.aiAnalysisCompletedAt,
});

const isOwnedByRequestUser = (assignment: any, requestUserId?: string): boolean => {
  if (!requestUserId) {
    return false;
  }

  return assignment.userId?.toString() === requestUserId;
};

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
      assignment: serializeAssignment(assignment),
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
      assignments: assignments.map(serializeAssignment),
      count: assignments.length,
      requestId: req.requestId ?? '-'
    });
  })
);

/**
 * Retry a failed assignment with bounded attempts.
 */
router.post(
  '/:assignmentId/retry',
  asyncHandler(async (req: Request, res: Response) => {
    const assignmentId = req.params.assignmentId as string;
    const requestUserId = getRequestUserId(req);

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

    if (!requestUserId) {
      res.status(401).json({
        error: {
          code: 'MISSING_USER_ID',
          message: 'x-user-id header is required'
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

    if (!isOwnedByRequestUser(assignment, requestUserId)) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to retry this assignment'
        },
        requestId: req.requestId ?? '-'
      });
      return;
    }

    const retryCount = assignment.recovery?.retryCount ?? 0;
    const maxRetryCount = assignment.recovery?.maxRetryCount ?? MAX_ASSIGNMENT_RETRIES;
    const failureCategory = assignment.recovery?.failureCategory ?? 'unknown';

    if (failureCategory === 'terminal') {
      res.status(409).json({
        error: {
          code: 'NON_RETRYABLE_FAILURE',
          message: 'This assignment failed for a terminal reason and cannot be retried automatically',
          statusMessage: ResultsService.getStatusMessage(assignment)
        },
        requestId: req.requestId ?? '-'
      });
      return;
    }

    if (!canRetryAssignment(retryCount, maxRetryCount)) {
      res.status(409).json({
        error: {
          code: 'RETRY_LIMIT_REACHED',
          message: 'Automatic retry limit reached for this assignment',
          retryCount,
          maxRetryCount,
          canReanalyze: true
        },
        requestId: req.requestId ?? '-'
      });
      return;
    }

    if (assignment.status !== 'failed') {
      res.status(409).json({
        error: {
          code: 'INVALID_STATE',
          message: 'Only failed assignments can be retried',
          currentStatus: assignment.status,
          statusMessage: ResultsService.getStatusMessage(assignment)
        },
        requestId: req.requestId ?? '-'
      });
      return;
    }

    try {
      const updatedAssignment = await AssignmentService.retryFailedAssignment(assignmentId, requestUserId);

      res.json({
        success: true,
        action: 'retry',
        assignment: serializeAssignment(updatedAssignment),
        requestId: req.requestId ?? '-'
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to retry assignment';
      const statusCode = message.includes('permission') ? 403 : message.includes('not found') ? 404 : 409;

      res.status(statusCode).json({
        error: {
          code: message.includes('permission')
            ? 'FORBIDDEN'
            : message.includes('processed')
              ? 'ASSIGNMENT_BUSY'
              : message.includes('limit')
                ? 'RETRY_LIMIT_REACHED'
                : 'RETRY_FAILED',
          message,
        },
        requestId: req.requestId ?? '-'
      });
    }
  })
);

/**
 * Re-run analysis for owned assignments in a controlled way.
 */
router.post(
  '/:assignmentId/reanalyze',
  asyncHandler(async (req: Request, res: Response) => {
    const assignmentId = req.params.assignmentId as string;
    const requestUserId = getRequestUserId(req);

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

    if (!requestUserId) {
      res.status(401).json({
        error: {
          code: 'MISSING_USER_ID',
          message: 'x-user-id header is required'
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

    if (!isOwnedByRequestUser(assignment, requestUserId)) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to re-analyze this assignment'
        },
        requestId: req.requestId ?? '-'
      });
      return;
    }

    if (!['completed', 'failed'].includes(assignment.status)) {
      res.status(409).json({
        error: {
          code: 'INVALID_STATE',
          message: 'Re-analysis is only available for completed or failed assignments',
          currentStatus: assignment.status,
          statusMessage: ResultsService.getStatusMessage(assignment)
        },
        requestId: req.requestId ?? '-'
      });
      return;
    }

    try {
      const updatedAssignment = await AssignmentService.reanalyzeAssignment(assignmentId, requestUserId);

      res.json({
        success: true,
        action: 'reanalyze',
        assignment: serializeAssignment(updatedAssignment),
        requestId: req.requestId ?? '-'
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to re-analyze assignment';
      const statusCode = message.includes('permission') ? 403 : message.includes('not found') ? 404 : 409;

      res.status(statusCode).json({
        error: {
          code: message.includes('permission')
            ? 'FORBIDDEN'
            : message.includes('processed')
              ? 'ASSIGNMENT_BUSY'
              : 'REANALYZE_FAILED',
          message,
        },
        requestId: req.requestId ?? '-'
      });
    }
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
      recovery: assignment.recovery,
      canRetry: assignment.status === 'failed'
        && (assignment.recovery?.failureCategory ?? 'unknown') !== 'terminal'
        && canRetryAssignment(
          assignment.recovery?.retryCount ?? 0,
          assignment.recovery?.maxRetryCount ?? MAX_ASSIGNMENT_RETRIES
        ),
      canReanalyze: ['completed', 'failed'].includes(assignment.status) && !assignment.recovery?.activeRunId,
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
