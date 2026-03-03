import { AssignmentFeedback, type IAssignmentFeedback } from '../models/assignmentFeedback.model.js';
import { publishEvent } from './mq.service.js';
import { appLogger } from './logger.js';
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
    files: {
      requirements?: UploadedFile;
      solution?: UploadedFile;
    }
  ): Promise<void> {
    const payload = {
      assignmentId,
      userId,
      solutionFileKey: files.solution!.key,
      requirementsFileKey: files.requirements?.key,
      bucket: files.solution!.bucket
    };

    await publishEvent('assignment-analysis', payload);
    
    appLogger.info('Assignment analysis event published', {
      assignmentId,
      messagePayload: payload
    });
  }

  /**
   * Get assignment by ID with full details
   */
  static async getAssignment(assignmentId: string): Promise<IAssignmentFeedback | null> {
    try {
      return await AssignmentFeedback.findById(assignmentId).lean();
    } catch (error) {
      appLogger.error('Failed to fetch assignment', {
        assignmentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Get assignments for a specific user
   */
  static async getUserAssignments(
    userId: string,
    limit: number = 10,
    offset: number = 0
  ): Promise<IAssignmentFeedback[]> {
    try {
      return await AssignmentFeedback.find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(offset)
        .lean();
    } catch (error) {
      appLogger.error('Failed to fetch user assignments', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  /**
   * Update assignment status
   */
  static async updateAssignmentStatus(
    assignmentId: string,
    status: IAssignmentFeedback['status'],
    metadata?: Partial<IAssignmentFeedback['metadata']>
  ): Promise<boolean> {
    try {
      const updateData: any = { status };
      if (metadata) {
        updateData.metadata = metadata;
      }

      const result = await AssignmentFeedback.findByIdAndUpdate(
        assignmentId,
        updateData,
        { new: true }
      );

      appLogger.info('Assignment status updated', {
        assignmentId,
        status,
        updated: !!result
      });

      return !!result;
    } catch (error) {
      appLogger.error('Failed to update assignment status', {
        assignmentId,
        status,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Check if uploaded files can form a complete assignment
   */
  static categorizeUploadedFiles(uploadResults: UploadedFile[]): {
    requirements?: UploadedFile;
    solution?: UploadedFile;
    others: UploadedFile[];
  } {
    const categorized = {
      requirements: undefined as UploadedFile | undefined,
      solution: undefined as UploadedFile | undefined,
      others: [] as UploadedFile[]
    };

    for (const file of uploadResults) {
      if (file.mimeType === 'application/pdf') {
        // Assume PDF is requirements (could be enhanced with filename analysis)
        if (!categorized.requirements) {
          categorized.requirements = file;
        } else {
          categorized.others.push(file);
        }
      } else if (file.mimeType === 'application/zip' || file.mimeType === 'application/x-zip-compressed') {
        // Assume ZIP is solution
        if (!categorized.solution) {
          categorized.solution = file;
        } else {
          categorized.others.push(file);
        }
      } else {
        categorized.others.push(file);
      }
    }

    return categorized;
  }
}