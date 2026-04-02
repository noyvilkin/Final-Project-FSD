import { randomUUID } from 'crypto';
import { AssignmentFeedback, type IAssignmentFeedback } from '../models/assignmentFeedback.model.js';
import { appLogger } from '../../../common/services/logger.js';
import { Types } from 'mongoose';
import { fetchBlobAsBuffer } from '../../../common/services/s3Upload.js';
import { AssignmentAnalysisService } from './assignmentAnalysisService.js';
import { AIAnalysisService } from './aiAnalysisService.js';
import { ZipProcessor } from '../../../common/utils/zipProcessor.js';
import { canRetryAssignment, normalizeAnalysisFailure, MAX_ASSIGNMENT_RETRIES, type RecoveryRunType } from './assignmentRecovery.js';

export interface AssignmentCreationResult {
  assignmentId: string;
  status: string;
  analysisTriggered: boolean;
}

export interface UploadedFile {
  bucket: string;
  key: string;
  url: string;
  mimeType: string;
  size: number;
}

export class AssignmentService {
  private static async updateFailureState(
    assignmentId: string,
    error: unknown,
    options: {
      status?: IAssignmentFeedback['status'];
      clearJobId?: boolean;
      rawAIResponse?: string;
    } = {}
  ): Promise<void> {
    const normalizedFailure = normalizeAnalysisFailure(error);
    const processingErrors = [
      normalizedFailure.reason,
      ...normalizedFailure.details.slice(1),
    ].filter(Boolean);

    if (options.rawAIResponse) {
      processingErrors.push(
        `Raw AI Response (first 1000 chars): ${options.rawAIResponse.substring(0, 1000)}`
      );
    }

    const unset: Record<string, 1> = {
      'recovery.activeRunId': 1,
      'recovery.activeRunType': 1,
      'recovery.activeRunStartedAt': 1,
    };

    if (options.clearJobId !== false) {
      unset.jobId = 1;
    }

    await AssignmentFeedback.findByIdAndUpdate(assignmentId, {
      $set: {
        status: options.status ?? 'failed',
        processingErrors,
        'recovery.failureReason': normalizedFailure.reason,
        'recovery.failureCategory': normalizedFailure.category,
        'recovery.lastFailureAt': new Date(),
      },
      $unset: unset,
    });
  }

  private static async claimRecoveryRun(
    assignmentId: string,
    ownerUserId: string,
    runType: 'retry' | 'reanalysis'
  ): Promise<IAssignmentFeedback | null> {
    const now = new Date();
    const runId = randomUUID();
    const baseFilter = {
      _id: assignmentId,
      userId: new Types.ObjectId(ownerUserId),
      $or: [{ jobId: { $exists: false } }, { jobId: null }],
    };

    const statusFilter = runType === 'retry'
      ? { status: 'failed' as const, 'recovery.retryCount': { $lt: MAX_ASSIGNMENT_RETRIES } }
      : { status: { $in: ['completed', 'failed'] as const } };

    const claimedAssignment = await AssignmentFeedback.findOneAndUpdate(
      {
        ...baseFilter,
        ...statusFilter,
      },
      {
        $set: {
          status: 'processing',
          jobId: runId,
          'recovery.activeRunId': runId,
          'recovery.activeRunType': runType,
          'recovery.activeRunStartedAt': now,
          ...(runType === 'retry' ? { 'recovery.lastRetryAt': now } : {}),
        },
        ...(runType === 'retry' ? { $inc: { 'recovery.retryCount': 1 } } : {}),
      },
      { new: true }
    );

    return claimedAssignment;
  }

  private static async startInitialRun(
    assignmentId: string,
    userId: string,
    files: { requirements?: UploadedFile; solution?: UploadedFile }
  ): Promise<void> {
    await this.runAnalysisPipeline(assignmentId, userId, files, 'initial');
  }

  /**
   * Create a new assignment and trigger analysis if both files are provided
   */
  static async createAssignment(
    userId: string,
    files: {
      requirements?: UploadedFile;
      solution?: UploadedFile;
    },
    userNotes?: string,
    preGeneratedId?: string
  ): Promise<AssignmentCreationResult> {
    try {
      // Validate required files
      if (!files.solution) {
        throw new Error('Solution file is required');
      }

      const resolvedUserId = Types.ObjectId.isValid(userId)
        ? new Types.ObjectId(userId)
        : new Types.ObjectId();

      if (!Types.ObjectId.isValid(userId)) {
        appLogger.warn('Invalid or missing userId for assignment creation, using generated fallback ObjectId', {
          userId
        });
      }

      // Use pre-generated ID if provided, otherwise MongoDB will auto-generate
      const assignmentData: any = {
        userId: resolvedUserId,
        requirementsFileKey: files.requirements?.key || '',
        solutionFileKey: files.solution.key,
        userNotes: userNotes?.trim() ? userNotes.trim() : undefined,
        metadata: {},
        status: 'pending'
      };

      if (preGeneratedId) {
        assignmentData._id = new Types.ObjectId(preGeneratedId);
        appLogger.info('Creating assignment with pre-generated ID', { assignmentId: preGeneratedId });
      }

      // Create assignment record
      const assignment = new AssignmentFeedback(assignmentData);

      const savedAssignment = await assignment.save();
      const assignmentId = savedAssignment._id.toString();

      appLogger.info('Assignment created', {
        assignmentId,
        userId,
        hasRequirements: !!files.requirements,
        hasUserNotes: !!userNotes?.trim(),
        solutionFileType: files.solution.mimeType
      });

      // Trigger analysis if we have a solution file
      let analysisTriggered = false;
      if (files.solution) {
        try {
          await this.startInitialRun(assignmentId, resolvedUserId.toString(), files);
          analysisTriggered = true;

          appLogger.info('Assignment analysis completed', { assignmentId, userId });
        } catch (error) {
          appLogger.error('Assignment analysis pipeline failed', {
            assignmentId,
            userId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });

          await this.updateFailureState(assignmentId, error, {
            rawAIResponse: error instanceof Error ? undefined : undefined,
          });
        }
      }

      return {
        assignmentId,
        status: analysisTriggered ? 'processing' : 'uploaded',
        analysisTriggered
      };

    } catch (error) {
      appLogger.error('Assignment creation failed', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Full analysis pipeline: download → scan → analyse → AI feedback.
   * Runs as a direct awaited call – no message queue involved.
   */
  private static async runAnalysisPipeline(
    assignmentId: string,
    _userId: string,
    files: { requirements?: UploadedFile; solution?: UploadedFile },
    runType: RecoveryRunType = 'initial'
  ): Promise<void> {
    if (!files.solution) {
      throw new Error('Solution file is required');
    }

    const bucket = files.solution.bucket;
    if (!bucket) {
      throw new Error('Missing bucket information');
    }

    const runId = randomUUID();

    await AssignmentFeedback.findByIdAndUpdate(assignmentId, {
      $set: {
        status: 'scanning',
        jobId: runId,
        'recovery.activeRunId': runId,
        'recovery.activeRunType': runType,
        'recovery.activeRunStartedAt': new Date(),
      },
    });

    const isZipSolution =
      files.solution.mimeType === 'application/zip' ||
      files.solution.mimeType === 'application/x-zip-compressed';

    if (!isZipSolution) {
      throw new Error('Analysis currently requires a ZIP solution file');
    }

    const solutionBuffer = await fetchBlobAsBuffer(files.solution.key, bucket);

    let requirementsBuffer: Buffer | undefined;
    if (files.requirements?.key) {
      requirementsBuffer = await fetchBlobAsBuffer(files.requirements.key, bucket);
    }

    const zipScanResult = await ZipProcessor.scanZipFile(solutionBuffer);
    if (!zipScanResult.isValid) {
      throw new Error(`ZIP scan failed: ${zipScanResult.errors.join('; ')}`);
    }

    const analysisResult = await AssignmentAnalysisService.analyzeAssignment({
      zipScanResult,
      pdfBuffer: requirementsBuffer
    });

    const sourceCodeContent = zipScanResult.sourceFiles.reduce<Record<string, string>>((acc, file) => {
      acc[file.path] = file.content;
      return acc;
    }, {});

    const totalLines = zipScanResult.sourceFiles.reduce(
      (sum, file) => sum + file.content.split('\n').length,
      0
    );

    const metadataUpdate = {
      ...analysisResult.metadata,
      sourceCodeContent,
      totalFiles: zipScanResult.sourceFiles.length,
      totalLines,
      detectedLanguage: analysisResult.metadata.detectedLanguage || zipScanResult.detectedLanguage,
      detectedFrameworks: analysisResult.metadata.detectedFrameworks || zipScanResult.metadata.frameworks
    };

    const analysisUpdate: Record<string, unknown> = {
      status: analysisResult.success ? 'processing' : 'failed',
      metadata: metadataUpdate,
    };

    if (analysisResult.errors.length > 0) {
      analysisUpdate.processingErrors = analysisResult.errors;
    }

    await AssignmentFeedback.findByIdAndUpdate(assignmentId, {
      $set: analysisUpdate,
    });

    if (!analysisResult.success) {
      await this.updateFailureState(assignmentId, `Assignment analysis failed: ${analysisResult.errors.join('; ')}`);
      throw new Error(`Assignment analysis failed: ${analysisResult.errors.join('; ')}`);
    }

    const aiResult = await AIAnalysisService.analyzeAssignmentWithAI(assignmentId);
    await AIAnalysisService.saveAnalysisResults(assignmentId, aiResult);

    appLogger.info('Analysis pipeline completed', {
      assignmentId,
      aiSuccess: aiResult.success
    });

    if (!aiResult.success) {
      throw new Error(aiResult.error || 'AI analysis failed');
    }
  }

  static async retryFailedAssignment(assignmentId: string, userId: string): Promise<IAssignmentFeedback> {
    const assignment = await AssignmentFeedback.findById(assignmentId);

    if (!assignment) {
      throw new Error('Assignment not found');
    }

    if (assignment.userId.toString() !== userId) {
      throw new Error('You do not have permission to retry this assignment');
    }

    if (assignment.status !== 'failed') {
      throw new Error('Only failed assignments can be retried');
    }

    if (assignment.recovery?.failureCategory === 'terminal') {
      throw new Error('This assignment has a terminal failure and cannot be automatically retried');
    }

    const retryCount = assignment.recovery?.retryCount ?? 0;
    if (!canRetryAssignment(retryCount, assignment.recovery?.maxRetryCount ?? MAX_ASSIGNMENT_RETRIES)) {
      throw new Error('Retry limit reached for this assignment');
    }

    const claimedAssignment = await this.claimRecoveryRun(assignmentId, assignment.userId.toString(), 'retry');
    if (!claimedAssignment) {
      throw new Error('Assignment is already being processed');
    }

    await this.runAnalysisPipeline(
      assignmentId,
      userId,
      {
        requirements: assignment.requirementsFileKey ? {
          bucket: process.env.S3_BUCKET_NAME || '',
          key: assignment.requirementsFileKey,
          url: '',
          mimeType: 'application/pdf',
          size: 0,
        } : undefined,
        solution: {
          bucket: process.env.S3_BUCKET_NAME || '',
          key: assignment.solutionFileKey,
          url: '',
          mimeType: 'application/zip',
          size: 0,
        },
      },
      'retry'
    );

    const refreshed = await AssignmentFeedback.findById(assignmentId);
    if (!refreshed) {
      throw new Error('Assignment not found after retry');
    }

    return refreshed;
  }

  static async reanalyzeAssignment(assignmentId: string, userId: string): Promise<IAssignmentFeedback> {
    const assignment = await AssignmentFeedback.findById(assignmentId);

    if (!assignment) {
      throw new Error('Assignment not found');
    }

    if (assignment.userId.toString() !== userId) {
      throw new Error('You do not have permission to re-analyze this assignment');
    }

    if (!['completed', 'failed'].includes(assignment.status)) {
      throw new Error('Re-analysis is only available for completed or failed assignments');
    }

    const claimedAssignment = await this.claimRecoveryRun(assignmentId, assignment.userId.toString(), 'reanalysis');
    if (!claimedAssignment) {
      throw new Error('Assignment is already being processed');
    }

    await this.runAnalysisPipeline(
      assignmentId,
      userId,
      {
        requirements: assignment.requirementsFileKey ? {
          bucket: process.env.S3_BUCKET_NAME || '',
          key: assignment.requirementsFileKey,
          url: '',
          mimeType: 'application/pdf',
          size: 0,
        } : undefined,
        solution: {
          bucket: process.env.S3_BUCKET_NAME || '',
          key: assignment.solutionFileKey,
          url: '',
          mimeType: 'application/zip',
          size: 0,
        },
      },
      'reanalysis'
    );

    const refreshed = await AssignmentFeedback.findById(assignmentId);
    if (!refreshed) {
      throw new Error('Assignment not found after re-analysis');
    }

    return refreshed;
  }

  /**
   * Get a single assignment by ID
   */
  static async getAssignment(assignmentId: string): Promise<IAssignmentFeedback | null> {
    return AssignmentFeedback.findById(assignmentId);
  }

  /**
   * Get all assignments for a user with pagination
   */
  static async getUserAssignments(
    userId: string,
    limit: number = 10,
    offset: number = 0
  ): Promise<IAssignmentFeedback[]> {
    return AssignmentFeedback.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset);
  }

  /**
   * Get assignments by status
   */
  static async getAssignmentsByStatus(
    userId: string,
    status: string
  ): Promise<IAssignmentFeedback[]> {
    return AssignmentFeedback.find({ userId, status }).sort({ createdAt: -1 });
  }

  /**
   * Update assignment status
   */
  static async updateAssignmentStatus(
    assignmentId: string,
    status: string,
    metadata?: Record<string, unknown>
  ): Promise<boolean> {
    try {
      const result = await AssignmentFeedback.findByIdAndUpdate(
        assignmentId,
        { status, ...(metadata && { metadata }) },
        { new: true }
      );
      return !!result;
    } catch (error) {
      appLogger.error('Failed to update assignment status', { error });
      return false;
    }
  }

  /**
   * Categorize uploaded files by type
   */
  static categorizeUploadedFiles(
    files: UploadedFile[]
  ): { requirements?: UploadedFile; solution?: UploadedFile } {
    const categorized: { requirements?: UploadedFile; solution?: UploadedFile } = {};

    for (const file of files) {
      const filename = file.key.toLowerCase();
      if (filename.includes('requirement') || filename.includes('spec')) {
        categorized.requirements = file;
      } else if (filename.includes('solution') || filename.includes('code') || filename.includes('main')) {
        categorized.solution = file;
      } else if (!categorized.solution) {
        // If no explicit solution file, use the first file as solution
        categorized.solution = file;
      }
    }

    return categorized;
  }
}
