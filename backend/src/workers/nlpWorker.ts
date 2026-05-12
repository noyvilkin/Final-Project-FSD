// NLP worker — polls Mongo for InterviewJobs that need processing and runs
// the appropriate stage:
//   status = 'Transcribed' → run analyzers (Mission 02) → Analyzed
//   status = 'Analyzed'    → run synthesis  (Mission 03) → Completed
//
// Run modes:
//   npm run worker:nlp                    → polling loop (default)
//   npm run worker:nlp -- <jobId>         → process one job once and exit
//                                            (handles whichever stage the
//                                             job is at, idempotently)
//
// Required env:
//   GEMINI_API_KEY  — Gemini auth
//   MONGODB_URI     — Mongo connection
//   S3_*            — read by common/services/s3Upload.ts at import time
//
// When a real MQ comes back, swap the polling loop for two subscribers:
//   transcription-completed → analyzeInterview
//   insights-completed      → synthesizeInterview
// The service functions stay the same.

import "dotenv/config";

import { connectToDatabase } from "../common/services/database.js";
import { getEventBus } from "../common/services/events/index.js";
import { getFileService } from "../common/services/files/index.js";
import { GeminiClient } from "../common/services/geminiClient.js";
import { appLogger } from "../common/services/logger.js";

import { InterviewJob } from "../features/interview/models/interviewJob.model.js";
import {
  analyzeInterview,
  type AnalyzeInterviewDeps,
} from "../features/interview/services/analyzeInterview.js";
import {
  synthesizeInterview,
  type SynthesizeInterviewDeps,
} from "../features/interview/services/synthesizeInterview.js";

const POLL_INTERVAL_MS = Number(process.env["WORKER_POLL_INTERVAL_MS"] ?? "5000");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processJob(
  jobId:   string,
  status:  string,
  analyzeDeps:   AnalyzeInterviewDeps,
  synthesizeDeps: SynthesizeInterviewDeps
): Promise<void> {
  if (status === "Transcribed") {
    await analyzeInterview({ jobId }, analyzeDeps);
    // Fall through — re-load the job and continue with synthesis if it
    // succeeded. Same loop iteration advances both stages.
    const refreshed = await InterviewJob.findById(jobId);
    if (refreshed?.status === "Analyzed") {
      await synthesizeInterview({ jobId }, synthesizeDeps);
    }
  } else if (status === "Analyzed") {
    await synthesizeInterview({ jobId }, synthesizeDeps);
  }
}

async function main(): Promise<void> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    appLogger.error("[worker:nlp] GEMINI_API_KEY is not set");
    process.exit(1);
  }

  await connectToDatabase();

  const gemini = new GeminiClient({ apiKey });

  const analyzeDeps: AnalyzeInterviewDeps = {
    gemini,
    files:  getFileService(),
    events: getEventBus(),
  };
  const synthesizeDeps: SynthesizeInterviewDeps = {
    gemini,
    events: getEventBus(),
  };

  const explicitJobId = process.argv[2];
  if (explicitJobId) {
    const job = await InterviewJob.findById(explicitJobId);
    if (!job) {
      appLogger.error("[worker:nlp] job not found", { jobId: explicitJobId });
      process.exit(1);
    }
    appLogger.info("[worker:nlp] processing single job", {
      jobId:  explicitJobId,
      status: job.status,
    });
    await processJob(explicitJobId, job.status, analyzeDeps, synthesizeDeps);
    appLogger.info("[worker:nlp] done");
    process.exit(0);
  }

  appLogger.info("[worker:nlp] polling for Transcribed/Analyzed jobs", {
    pollIntervalMs: POLL_INTERVAL_MS,
  });

  let running = true;
  const stop = () => {
    if (running) appLogger.info("[worker:nlp] shutdown signal received");
    running = false;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (running) {
    const job = await InterviewJob
      .findOne({ status: { $in: ["Transcribed", "Analyzed"] } })
      .sort({ updatedAt: 1 });

    if (!job) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    const jobId  = (job._id as { toString(): string }).toString();
    const status = job.status;
    try {
      await processJob(jobId, status, analyzeDeps, synthesizeDeps);
    } catch (err) {
      appLogger.error("[worker:nlp] job failed — moving on", {
        jobId,
        status,
        error: err instanceof Error ? err.message : err,
      });
    }
  }

  appLogger.info("[worker:nlp] exiting");
  process.exit(0);
}

main().catch((err) => {
  appLogger.error("[worker:nlp] fatal", { error: err });
  process.exit(1);
});
