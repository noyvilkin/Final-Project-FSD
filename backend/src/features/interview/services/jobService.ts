import { randomUUID } from "crypto";
import { Types } from "mongoose";

import type { IEventBus } from "../../../common/services/events/IEventBus.js";
import type { IFileService } from "../../../common/services/files/IFileService.js";
import { appLogger } from "../../../common/services/logger.js";

import { InterviewJob } from "../models/interviewJob.model.js";
import { streamInterviewMedia } from "./uploadStream.js";

export const MEDIA_INGESTED_TOPIC = "media-ingested";

export interface CreateInterviewJobArgs {
  userId:    string;
  buffer:    Buffer;
  mimeType:  string;
  mediaType: "audio" | "video";
  files:     IFileService;
  events:    IEventBus;
}

export interface CreateInterviewJobResult {
  jobId:         string;
  storageKey:    string;
  correlationId: string;
  status:        "Pending";
  sizeBytes:     number;
  mediaType:     "audio" | "video";
  mimeType:      string;
}

export interface MediaIngestedPayload {
  jobId:      string;
  userId:     string;
  storageKey: string;
  mediaType:  "audio" | "video";
  mimeType:   string;
  sizeBytes:  number;
}

// Creates an InterviewJob (status Pending), streams the media to object storage
// under interviews/{userId}/{jobId}/raw.{ext}, writes the storage key back onto
// the job, and publishes a media-ingested event so downstream workers
// (transcribe → analyze → consolidate) can pick it up.
//
// On any failure, the job is marked Failed with errorMessage and the error
// is rethrown so the route can return a 5xx.
export async function createInterviewJob(
  args: CreateInterviewJobArgs
): Promise<CreateInterviewJobResult> {
  const correlationId = randomUUID();
  const userObjectId  = new Types.ObjectId(args.userId);

  // Pre-generate the job id so the storage key can include it.
  const jobId = new Types.ObjectId();

  const job = await InterviewJob.create({
    _id:           jobId,
    userId:        userObjectId,
    mediaFileKey:  "pending",
    mediaType:     args.mediaType,
    mimeType:      args.mimeType,
    sizeBytes:     args.buffer.length,
    status:        "Pending",
    correlationId,
  });

  const jobIdStr = jobId.toString();

  try {
    const uploadResult = await streamInterviewMedia({
      files:    args.files,
      userId:   args.userId,
      jobId:    jobIdStr,
      mimeType: args.mimeType,
      buffer:   args.buffer,
    });

    job.mediaFileKey = uploadResult.storageKey;
    await job.save();

    const payload: MediaIngestedPayload = {
      jobId:      jobIdStr,
      userId:     args.userId,
      storageKey: uploadResult.storageKey,
      mediaType:  args.mediaType,
      mimeType:   args.mimeType,
      sizeBytes:  uploadResult.sizeBytes,
    };

    await args.events.publish<MediaIngestedPayload>({
      topic:         MEDIA_INGESTED_TOPIC,
      payload,
      correlationId,
      occurredAt:    new Date(),
    });

    appLogger.info("Interview job created", {
      jobId: jobIdStr,
      userId: args.userId,
      correlationId,
    });

    return {
      jobId:         jobIdStr,
      storageKey:    uploadResult.storageKey,
      correlationId,
      status:        "Pending",
      sizeBytes:     uploadResult.sizeBytes,
      mediaType:     args.mediaType,
      mimeType:      args.mimeType,
    };
  } catch (err) {
    job.status       = "Failed";
    job.errorMessage = err instanceof Error ? err.message : String(err);
    await job.save().catch((saveErr) => {
      appLogger.error("Failed to mark interview job as Failed", {
        jobId: jobIdStr,
        saveErr,
      });
    });
    throw err;
  }
}
