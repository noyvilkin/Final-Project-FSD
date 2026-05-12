import type { IEventBus } from "../../../common/services/events/IEventBus.js";
import type { IFileService } from "../../../common/services/files/IFileService.js";
import { appLogger } from "../../../common/services/logger.js";
import type { WhisperClient } from "../../../common/services/whisperClient.js";

import { InterviewJob } from "../models/interviewJob.model.js";

export const TRANSCRIPTION_COMPLETED_TOPIC = "transcription-completed";

export interface ProcessInterviewJobDeps {
  whisper: WhisperClient;
  files:   IFileService;
  events:  IEventBus;
}

export interface ProcessInterviewJobResult {
  jobId:            string;
  transcriptKey:    string;
  status:           "Transcribed";
  durationSeconds?: number;
  /** True when the job was already past Pending and we skipped re-running. */
  skipped?:         boolean;
}

export interface TranscriptionCompletedPayload {
  jobId:            string;
  userId:           string;
  transcriptKey:    string;
  durationSeconds?: number;
}

const SKIPPABLE_STATUSES = new Set([
  "Transcribed",
  "Analyzing",
  "Analyzed",
  "Completed",
]);

// Processes one InterviewJob end-to-end:
//   download media → Whisper → save transcript JSON → mark Transcribed
//   → publish transcription-completed
//
// Idempotent on jobId. Marks the job Failed and rethrows on any error so
// the worker can decide whether to retry (currently retries are manual —
// when the real MQ lands, redeliveries will retry automatically).
export async function processInterviewJob(
  jobId: string,
  deps:  ProcessInterviewJobDeps
): Promise<ProcessInterviewJobResult> {
  const job = await InterviewJob.findById(jobId);
  if (!job) {
    throw new Error(`Interview job not found: ${jobId}`);
  }

  if (SKIPPABLE_STATUSES.has(job.status)) {
    appLogger.info("Interview job already transcribed — skipping", {
      jobId,
      status: job.status,
    });
    return {
      jobId,
      transcriptKey:   job.transcriptKey ?? "",
      status:          "Transcribed",
      durationSeconds: job.durationSeconds,
      skipped:         true,
    };
  }

  job.status = "Transcribing";
  await job.save();

  try {
    // 1) Pull the raw media from storage.
    const buffer = await deps.files.getBuffer(job.mediaFileKey);

    // 2) Hand to Whisper.
    const filename   = job.mediaFileKey.split("/").pop() ?? "media.bin";
    const transcript = await deps.whisper.transcribe({
      buffer,
      filename,
      mimeType: job.mimeType,
    });

    // 3) Persist the structured transcript JSON next to the raw media.
    const userIdStr     = job.userId.toString();
    const transcriptKey = `interviews/${userIdStr}/${jobId}/transcript.json`;
    const transcriptBuf = Buffer.from(JSON.stringify(transcript, null, 2), "utf-8");

    await deps.files.putBuffer({
      key:      transcriptKey,
      buffer:   transcriptBuf,
      mimeType: "application/json",
    });

    // 4) Advance the job state.
    job.transcriptKey = transcriptKey;
    job.status        = "Transcribed";
    if (transcript.durationSeconds && !job.durationSeconds) {
      job.durationSeconds = transcript.durationSeconds;
    }
    await job.save();

    // 5) Tell the rest of the pipeline.
    const payload: TranscriptionCompletedPayload = {
      jobId,
      userId:          userIdStr,
      transcriptKey,
      durationSeconds: job.durationSeconds,
    };

    await deps.events.publish<TranscriptionCompletedPayload>({
      topic:         TRANSCRIPTION_COMPLETED_TOPIC,
      payload,
      correlationId: job.correlationId,
      occurredAt:    new Date(),
    });

    appLogger.info("Interview transcribed", {
      jobId,
      transcriptKey,
      durationSeconds: job.durationSeconds,
      correlationId:   job.correlationId,
    });

    return {
      jobId,
      transcriptKey,
      durationSeconds: job.durationSeconds,
      status:          "Transcribed",
    };
  } catch (err) {
    job.status       = "Failed";
    job.errorMessage = err instanceof Error ? err.message : String(err);
    await job.save().catch((saveErr) => {
      appLogger.error("Failed to mark interview job as Failed", {
        jobId,
        saveErr,
      });
    });
    throw err;
  }
}
