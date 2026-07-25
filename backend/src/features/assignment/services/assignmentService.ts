import { AssignmentFeedback, type IAssignmentFeedback } from '../models/assignmentFeedback.model.js';
import { appLogger } from '../../../common/services/logger.js';
import { Types } from 'mongoose';
import { fetchBlobAsBuffer, deleteBlob } from '../../../common/services/s3Upload.js';
import { AssignmentAnalysisService } from './assignmentAnalysisService.js';
import { AIAnalysisService } from './aiAnalysisService.js';
import { ZipProcessor } from '../../../common/utils/zipProcessor.js';

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
      // the S3 download + ZIP scan + Gemini call. The client polls the status.
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

        try {
          await AssignmentFeedback.findByIdAndUpdate(assignmentId, {
            status: 'failed',
            processingErrors: [
              error instanceof Error ? error.message : 'Analysis pipeline failed'
            ]
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
    return AssignmentFeedback.findById(assignmentId);
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
      .skip(offset);
  }

  /**
   * Count all assignments for a user
   */
  static async countUserAssignments(userId: string): Promise<number> {
    if (!Types.ObjectId.isValid(userId)) {
      return 0;
    }

    return AssignmentFeedback.countDocuments({ userId });
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
