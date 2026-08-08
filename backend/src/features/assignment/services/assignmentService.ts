import { AssignmentFeedback, type IAssignmentFeedback } from '../models/assignmentFeedback.model.js';
import { appLogger } from '../../../common/services/logger.js';
import { Types } from 'mongoose';
import { fetchBlobAsBuffer, deleteBlob } from '../../../common/services/s3Upload.js';
import { AssignmentAnalysisService } from './assignmentAnalysisService.js';
import { AIAnalysisService } from './aiAnalysisService.js';
import { ZipProcessor } from '../../../common/utils/zipProcessor.js';
import { ColmanRateLimitError } from '../../../common/services/colmanLLMClient.js';

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

/** The two roles an uploaded assignment file can play. */
export type AssignmentFileRole = 'requirements' | 'solution';

export class AssignmentService {
  /**
   * Max assignments a single user may submit per rolling 24h. Each submission
   * costs LLM requests from the shared Colman LLM quota (5 req/min, shared
   * across the whole app), so this stops one user starving everyone else.
   * Override via env.
   */
  static readonly MAX_ASSIGNMENTS_PER_DAY = Number(process.env.ASSIGNMENT_DAILY_LIMIT || '20');

  /**
   * Non-terminal records older than this are considered orphaned (e.g. the
   * process restarted mid-analysis) and are swept to `failed` on the next read.
   * A normal run finishes in ~15s, so 10 min is comfortably safe.
   */
  private static readonly STALE_ANALYSIS_MS = 10 * 60 * 1000;
  private static readonly TERMINAL_STATUSES = ['completed', 'failed'];

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

      // The caller must be an authenticated user. Never fabricate an owner —
      // that would attach the assignment (and its stored files) to a random id.
      if (!Types.ObjectId.isValid(userId)) {
        throw new Error('A valid authenticated userId is required to create an assignment');
      }

      const resolvedUserId = new Types.ObjectId(userId);

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

      // Run analysis in the background so the upload response isn't blocked by
      // the S3 download + ZIP scan + LLM call. The client polls the status.
      this.runAnalysisInBackground(assignmentId, resolvedUserId.toString(), files);

      return {
        assignmentId,
        status: 'processing',
        analysisTriggered: true
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
   * Fire-and-forget wrapper around {@link runAnalysisPipeline}: never rejects, and
   * marks the assignment `failed` on error so it always reaches a terminal state.
   */
  private static runAnalysisInBackground(
    assignmentId: string,
    userId: string,
    files: { requirements?: UploadedFile; solution?: UploadedFile }
  ): void {
    void this.runAnalysisPipeline(assignmentId, userId, files)
      .then(() => {
        appLogger.info('Assignment analysis completed', { assignmentId, userId });
      })
      .catch(async (error) => {
        appLogger.error('Assignment analysis pipeline failed', {
          assignmentId,
          userId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });

        // Turn the shared rate-limit errors into a friendly, actionable message.
        const isQuota = error instanceof ColmanRateLimitError;
        const message = isQuota
          ? 'Our analysis service is temporarily at capacity. Please try again later.'
          : error instanceof Error
            ? error.message
            : 'Analysis pipeline failed';

        try {
          await AssignmentFeedback.findByIdAndUpdate(assignmentId, {
            status: 'failed',
            processingErrors: [message]
          });
        } catch (updateError) {
          appLogger.error('Failed to mark assignment as failed after pipeline error', {
            assignmentId,
            error: updateError instanceof Error ? updateError.message : 'Unknown error'
          });
        }
      });
  }

  /**
   * Full analysis pipeline: download → scan → analyse → AI feedback.
   */
  private static async runAnalysisPipeline(
    assignmentId: string,
    _userId: string,
    files: { requirements?: UploadedFile; solution?: UploadedFile }
  ): Promise<void> {
    if (!files.solution) {
      throw new Error('Solution file is required');
    }

    const bucket = files.solution.bucket;
    if (!bucket) {
      throw new Error('Missing bucket information');
    }

    await AssignmentFeedback.findByIdAndUpdate(assignmentId, { status: 'scanning' });

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

    await AssignmentFeedback.findByIdAndUpdate(assignmentId, {
      status: analysisResult.success ? 'processing' : 'failed',
      metadata: metadataUpdate,
      ...(analysisResult.errors.length > 0 ? { processingErrors: analysisResult.errors } : {})
    });

    if (!analysisResult.success) {
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

  /**
   * Get a single assignment by ID
   */
  static async getAssignment(assignmentId: string): Promise<IAssignmentFeedback | null> {
    const assignment = await AssignmentFeedback.findById(assignmentId).lean();
    if (!assignment) {
      return null;
    }
    return (await AssignmentService.sweepIfStale(assignment)) ?? assignment;
  }

  /**
   * Lazy watchdog: if a record is stuck in a non-terminal state past
   * {@link STALE_ANALYSIS_MS} (typically because the process died mid-analysis
   * with no one to mark it failed), flip it to `failed` so it stops polling
   * forever and stops counting against the user's daily cap. The update is
   * conditional/atomic so we never clobber a run that's still legitimately
   * progressing. Returns the updated doc if swept, otherwise null.
   */
  private static async sweepIfStale(
    assignment: IAssignmentFeedback
  ): Promise<IAssignmentFeedback | null> {
    if (AssignmentService.TERMINAL_STATUSES.includes(assignment.status)) {
      return null;
    }

    const updatedAt = assignment.updatedAt?.getTime() ?? 0;
    if (Date.now() - updatedAt < AssignmentService.STALE_ANALYSIS_MS) {
      return null;
    }

    const cutoff = new Date(Date.now() - AssignmentService.STALE_ANALYSIS_MS);
    const swept = await AssignmentFeedback.findOneAndUpdate(
      {
        _id: assignment._id,
        status: { $nin: AssignmentService.TERMINAL_STATUSES },
        updatedAt: { $lt: cutoff }
      },
      {
        status: 'failed',
        processingErrors: ['Analysis timed out and did not finish. Please submit again.']
      },
      { new: true }
    );

    if (swept) {
      appLogger.warn('Swept orphaned assignment to failed', {
        assignmentId: assignment._id?.toString(),
        previousStatus: assignment.status
      });
    }

    return swept;
  }

  /**
   * Fields returned for the history list. Heavy metadata (source code content,
   * extracted requirements, detailed feedback) is intentionally excluded so the
   * list payload stays small.
   */
  private static readonly LIST_PROJECTION = [
    'status',
    'requirementsFileKey',
    'solutionFileKey',
    'userNotes',
    'aiFeedback.overall',
    'metadata.detectedLanguage',
    'metadata.detectedFrameworks',
    'metadata.projectScope',
    'metadata.totalFiles',
    'metadata.totalLines',
    'createdAt',
    'updatedAt'
  ].join(' ');

  /**
   * Get all assignments for a user with pagination (slim projection for lists)
   */
  static async getUserAssignments(
    userId: string,
    limit: number = 10,
    offset: number = 0
  ): Promise<IAssignmentFeedback[]> {
    if (!Types.ObjectId.isValid(userId)) {
      return [];
    }

    return AssignmentFeedback.find({ userId })
      .select(AssignmentService.LIST_PROJECTION)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset)
      .lean();
  }

  /**
   * Count all assignments for a user (for pagination metadata)
   */
  static async countUserAssignments(userId: string): Promise<number> {
    if (!Types.ObjectId.isValid(userId)) {
      return 0;
    }

    return AssignmentFeedback.countDocuments({ userId });
  }

  /**
   * Whether the user is under the per-day submission cap. Counts records created
   * in the last 24h, including still-in-progress ones so bursts can't slip
   * through, but excluding `failed` ones — a user shouldn't lose quota because
   * storage/the LLM service was down and their attempt never produced a result.
   */
  static async isWithinDailyLimit(userId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(userId)) {
      return false;
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const count = await AssignmentFeedback.countDocuments({
      userId,
      status: { $ne: 'failed' },
      createdAt: { $gte: since }
    });

    return count < AssignmentService.MAX_ASSIGNMENTS_PER_DAY;
  }

  /**
   * Delete an assignment (verifying ownership) and clean up its S3 objects.
   * Returns true when a document was found and deleted, false otherwise.
   */
  static async deleteAssignment(
    assignmentId: string,
    userId: string
  ): Promise<boolean> {
    if (!Types.ObjectId.isValid(assignmentId) || !Types.ObjectId.isValid(userId)) {
      return false;
    }

    const deleted = await AssignmentFeedback.findOneAndDelete({
      _id: assignmentId,
      userId
    });

    if (!deleted) {
      return false;
    }

    const keys = [deleted.requirementsFileKey, deleted.solutionFileKey].filter(
      (key): key is string => typeof key === 'string' && key.length > 0
    );

    for (const key of keys) {
      try {
        await deleteBlob(key);
      } catch (error) {
        appLogger.warn('Failed to delete assignment blob (orphan possible)', {
          assignmentId,
          key,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return true;
  }

  /**
   * Get assignments by status
   */
  static async getAssignmentsByStatus(
    userId: string,
    status: string
  ): Promise<IAssignmentFeedback[]> {
    return AssignmentFeedback.find({ userId, status })
      .sort({ createdAt: -1 })
      .lean();
  }

  /**
   * Resolve an uploaded assignment file's role from the explicit prefix the
   * client attaches on upload. The frontend uploads exactly two files named
   * `requirement-<original>` and `solution-<original>` (AssignmentProcessing.jsx),
   * so the role is passed in-band rather than guessed from arbitrary filenames.
   * Returns null for anything that doesn't carry a known role prefix.
   */
  static roleFromUploadName(originalName: string): AssignmentFileRole | null {
    const name = originalName.toLowerCase();
    if (name.startsWith('requirement-')) return 'requirements';
    if (name.startsWith('solution-')) return 'solution';
    return null;
  }
}
