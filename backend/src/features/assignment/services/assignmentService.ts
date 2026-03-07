import { AssignmentFeedback, type IAssignmentFeedback } from '../models/assignmentFeedback.model.js';
import { publishEvent } from '../../../common/services/mq.service.js';
import { appLogger } from '../../../common/services/logger.js';
import type { Types } from 'mongoose';

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
    }
  ): Promise<AssignmentCreationResult> {
    try {
      // Validate required files
      if (!files.solution) {
        throw new Error('Solution file is required');
      }

      // Create assignment record
      const assignment = new AssignmentFeedback({
        userId: userId as unknown as Types.ObjectId,
        requirementsFileKey: files.requirements?.key || '',
        solutionFileKey: files.solution.key,
        metadata: {},
        status: 'pending'
      });

      const savedAssignment = await assignment.save();
      const assignmentId = savedAssignment._id.toString();

      appLogger.info('Assignment created', {
        assignmentId,
        userId,
        hasRequirements: !!files.requirements,
        solutionFileType: files.solution.mimeType
      });

      // Trigger analysis if we have a solution file
      let analysisTriggered = false;
      if (files.solution) {
        try {
          await this.triggerAssignmentAnalysis(assignmentId, userId, files);
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
   * Trigger the assignment analysis pipeline via QStash
   */
  private static async triggerAssignmentAnalysis(
    assignmentId: string,
    userId: string,
    files: { requirements?: UploadedFile; solution?: UploadedFile }
  ): Promise<void> {
    // Update status to scanning
    await AssignmentFeedback.findByIdAndUpdate(assignmentId, {
      status: 'scanning'
    });

    // Publish event to trigger analysis
    const payload = {
      assignmentId,
      userId,
      solutionFileKey: files.solution?.key,
      requirementsFileKey: files.requirements?.key || null,
      bucket: files.solution?.bucket,
      solutionMimeType: files.solution?.mimeType
    };

    await publishEvent('file-ingested', payload);
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