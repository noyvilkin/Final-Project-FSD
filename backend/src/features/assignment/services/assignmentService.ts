import { AssignmentFeedback, type IAssignmentFeedback } from '../models/assignmentFeedback.model.js';
import { appLogger } from '../../../common/services/logger.js';
import { Types } from 'mongoose';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
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
  private static s3Client: S3Client | null = null;

  private static getS3Client(): S3Client {
    if (this.s3Client) {
      return this.s3Client;
    }

    const endpoint = process.env.S3_ENDPOINT;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error('Missing S3 configuration for local analysis fallback');
    }

    this.s3Client = new S3Client({
      endpoint,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey }
    });

    return this.s3Client;
  }

  private static async streamToBuffer(stream: unknown): Promise<Buffer> {
    if (!stream || typeof stream !== 'object' || !(Symbol.asyncIterator in (stream as object))) {
      throw new Error('Invalid stream response from S3');
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
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
          await this.triggerAssignmentAnalysis(assignmentId, resolvedUserId.toString(), files);
          analysisTriggered = true;
          
          appLogger.info('Assignment analysis triggered', {
            assignmentId,
            userId
          });
        } catch (error) {
          appLogger.error('Failed to trigger assignment analysis', {
            assignmentId,
            userId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          
          // Update assignment status to failed
          await AssignmentFeedback.findByIdAndUpdate(assignmentId, {
            status: 'failed',
            metadata: {
              processingErrors: ['Failed to trigger analysis pipeline']
            }
          });
        }
      }

      return {
        assignmentId,
        status: analysisTriggered ? 'analysis-queued' : 'uploaded',
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
   * Trigger the assignment analysis pipeline (local processing).
   */
  private static async triggerAssignmentAnalysis(
    assignmentId: string,
    _userId: string,
    files: { requirements?: UploadedFile; solution?: UploadedFile }
  ): Promise<void> {
    await AssignmentFeedback.findByIdAndUpdate(assignmentId, {
      status: 'scanning'
    });

    await this.runLocalAnalysisFallback(assignmentId, files);
  }

  private static async runLocalAnalysisFallback(
    assignmentId: string,
    files: { requirements?: UploadedFile; solution?: UploadedFile }
  ): Promise<void> {
    if (!files.solution) {
      throw new Error('Solution file is required for local analysis fallback');
    }

    const bucket = files.solution.bucket;
    if (!bucket) {
      throw new Error('Missing bucket information for local analysis fallback');
    }

    // Local fallback currently supports ZIP-based source code analysis.
    const isZipSolution =
      files.solution.mimeType === 'application/zip' ||
      files.solution.mimeType === 'application/x-zip-compressed';

    if (!isZipSolution) {
      throw new Error('Local analysis fallback requires a ZIP solution file');
    }

    const s3Client = this.getS3Client();

    const solutionObject = await s3Client.send(
      new GetObjectCommand({ Bucket: bucket, Key: files.solution.key })
    );
    const solutionBuffer = await this.streamToBuffer(solutionObject.Body);

    let requirementsBuffer: Buffer | undefined;
    if (files.requirements?.key) {
      const requirementsObject = await s3Client.send(
        new GetObjectCommand({ Bucket: bucket, Key: files.requirements.key })
      );
      requirementsBuffer = await this.streamToBuffer(requirementsObject.Body);
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

    const totalLines = zipScanResult.sourceFiles.reduce((sum, file) => {
      return sum + file.content.split('\n').length;
    }, 0);

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

    appLogger.info('Local analysis fallback completed', {
      assignmentId,
      aiSuccess: aiResult.success
    });

    if (!aiResult.success) {
      throw new Error(aiResult.error || 'AI analysis failed in local fallback');
    }
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
  }}