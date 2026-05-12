// Transcription worker — polls Mongo for Pending InterviewJobs and processes
// them one at a time. Until the project has a real message queue, this
// polling loop stands in for an event subscriber. When the MQ comes back,
// replace the loop with a subscriber that calls processInterviewJob() on
// transcription-completed events; the service stays the same.
//
// Run modes:
//   npm run worker:transcribe                  → polling loop (default)
//   npm run worker:transcribe -- <jobId>       → process one job and exit
//
// Required env:
//   OPENAI_API_KEY  — Whisper auth
//   MONGODB_URI     — Mongo connection
//   S3_*            — read by common/services/s3Upload.ts at import time

import "dotenv/config";

import { connectToDatabase } from "../common/services/database.js";
import { getEventBus } from "../common/services/events/index.js";
import { getFileService } from "../common/services/files/index.js";
import { appLogger } from "../common/services/logger.js";
import { WhisperClient } from "../common/services/whisperClient.js";

import { InterviewJob } from "../features/interview/models/interviewJob.model.js";
import {
  processInterviewJob,
  type ProcessInterviewJobDeps,
} from "../features/interview/services/transcriptionService.js";

const POLL_INTERVAL_MS = Number(process.env["WORKER_POLL_INTERVAL_MS"] ?? "5000");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    appLogger.error("[worker:transcribe] OPENAI_API_KEY is not set");
    process.exit(1);
  }

  await connectToDatabase();

  const deps: ProcessInterviewJobDeps = {
    whisper: new WhisperClient({ apiKey }),
    files:   getFileService(),
    events:  getEventBus(),
  };

  const explicitJobId = process.argv[2];
  if (explicitJobId) {
    appLogger.info("[worker:transcribe] processing single job", { jobId: explicitJobId });
    const result = await processInterviewJob(explicitJobId, deps);
    appLogger.info("[worker:transcribe] done", result);
    process.exit(0);
  }

  appLogger.info("[worker:transcribe] polling for Pending jobs", {
    pollIntervalMs: POLL_INTERVAL_MS,
  });

  let running = true;
  const stop = () => {
    if (running) appLogger.info("[worker:transcribe] shutdown signal received");
    running = false;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (running) {
    const job = await InterviewJob.findOne({ status: "Pending" }).sort({ createdAt: 1 });

    if (!job) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    const jobId = (job._id as { toString(): string }).toString();
    try {
      await processInterviewJob(jobId, deps);
    } catch (err) {
      appLogger.error("[worker:transcribe] job failed — moving on", {
        jobId,
        error: err instanceof Error ? err.message : err,
      });
      // The job is already marked Failed by the service; loop continues.
    }
  }

  appLogger.info("[worker:transcribe] exiting");
  process.exit(0);
}

main().catch((err) => {
  appLogger.error("[worker:transcribe] fatal", { error: err });
  process.exit(1);
});
