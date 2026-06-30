import { InterviewInsights, type IInterviewInsights } from '../models/interviewInsights.model.js';
import { appLogger } from '../../../common/services/logger.js';
import { Types } from 'mongoose';

export interface InterviewCreationResult {
  interviewId: string;
  status: string;
}

export class InterviewService {
  static async createInterview(
    userId: string,
    mediaFileKey: string,
    mediaType: 'audio' | 'video',
    jobId?: string,
    preGeneratedId?: string,
    fileSizeBytes?: number,
    mimeType?: string,
    jobTitle?: string,
    company?: string,
  ): Promise<InterviewCreationResult> {
    const resolvedUserId = Types.ObjectId.isValid(userId)
      ? new Types.ObjectId(userId)
      : new Types.ObjectId();

    if (!Types.ObjectId.isValid(userId)) {
      appLogger.warn('Invalid or missing userId for interview creation, using generated fallback ObjectId', {
        userId,
      });
    }

    const interviewData: Record<string, unknown> = {
      userId: resolvedUserId,
      mediaFileKey,
      mediaType,
      status: 'pending',
      jobId:    jobId?.trim()    || undefined,
      jobTitle: jobTitle?.trim() || undefined,
      company:  company?.trim()  || undefined,
      fileSizeBytes,
      mimeType,
    };

    if (preGeneratedId) {
      interviewData._id = new Types.ObjectId(preGeneratedId);
      appLogger.info('Creating interview with pre-generated ID', { interviewId: preGeneratedId });
    }

    const interview = new InterviewInsights(interviewData);
    const saved = await interview.save();
    const interviewId = saved._id.toString();

    appLogger.info('Interview record created', {
      interviewId,
      userId,
      mediaType,
      mediaFileKey,
      hasJobId: !!jobId?.trim(),
    });

    return { interviewId, status: 'pending' };
  }

  static async getInterview(interviewId: string): Promise<IInterviewInsights | null> {
    if (!Types.ObjectId.isValid(interviewId)) return null;
    return InterviewInsights.findById(interviewId).exec();
  }

  static async getUserInterviews(
    userId: string,
    limit = 10,
    offset = 0
  ): Promise<IInterviewInsights[]> {
    if (!Types.ObjectId.isValid(userId)) return [];
    return InterviewInsights.find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .exec();
  }
}
