import type { IEventBus } from "../../../common/services/events/IEventBus.js";
import type { GeminiClient } from "../../../common/services/geminiClient.js";
import { appLogger } from "../../../common/services/logger.js";

import { InterviewJob } from "../models/interviewJob.model.js";
import {
  InterviewInsights,
  type IInterviewInsights,
} from "../models/interviewInsights.model.js";

import { consolidateArtifact } from "./artifactConsolidator.js";
import { generateCoaching } from "./coachingAdvice.js";
import { computeReadiness } from "./readinessEngine.js";
import { enrichDnaFromInterview } from "./dnaEnrichment.js";

export const ANALYSIS_COMPLETED_TOPIC = "analysis-completed";

export interface SynthesizeInterviewDeps {
  gemini: GeminiClient;
  events: IEventBus;
}

export interface SynthesizeInterviewArgs {
  jobId: string;
}

export interface SynthesizeInterviewResult {
  jobId:         string;
  insightsId:    string;
  readinessScore: number;
  dnaVersion?:   number;
  /** True when the job was already past Analyzed and we skipped. */
  skipped?:      boolean;
}

// Reads the Mission 02 analyzer outputs for a job, runs:
//   readinessEngine → coachingAdvice → artifactConsolidator → DNA enrichment
// then persists everything to InterviewInsights and marks the job Completed.
//
// Idempotent on interviewJobId: re-runs replace readiness/coaching/insights
// and bump the doc version. If the job is already Completed/Failed we skip.
export async function synthesizeInterview(
  args: SynthesizeInterviewArgs,
  deps: SynthesizeInterviewDeps
): Promise<SynthesizeInterviewResult> {
  const job = await InterviewJob.findById(args.jobId);
  if (!job) throw new Error(`Interview job not found: ${args.jobId}`);

  if (job.status === "Completed" || job.status === "Failed") {
    appLogger.info("Interview already finalised — skipping synthesis", {
      jobId:  args.jobId,
      status: job.status,
    });
    const existing = await InterviewInsights.findOne({ interviewJobId: job._id });
    return {
      jobId:          args.jobId,
      insightsId:     existing ? (existing._id as { toString(): string }).toString() : "",
      readinessScore: existing?.readiness?.readinessScore ?? 0,
      skipped:        true,
    };
  }

  if (job.status !== "Analyzed") {
    throw new Error(
      `Interview job ${args.jobId} is in status '${job.status}' — synthesis requires 'Analyzed'`
    );
  }

  const insights = (await InterviewInsights.findOne({
    interviewJobId: job._id,
  })) as IInterviewInsights | null;

  if (!insights || !insights.analyzers) {
    throw new Error(`Interview job ${args.jobId} has no analyzers output to synthesise`);
  }

  const transcript = insights.transcript ?? "";
  if (transcript.length === 0) {
    throw new Error(`Interview job ${args.jobId} has empty transcript`);
  }

  try {
    // 1) Readiness — pure computation.
    const readiness = computeReadiness(insights.analyzers);

    // 2) Coaching — Gemini.
    const coaching = await generateCoaching({
      transcript,
      analyzers: {
        contentQuality: insights.analyzers.contentQuality
          ? {
              technicalAccuracy:     insights.analyzers.contentQuality.technicalAccuracy,
              professionalRelevance: insights.analyzers.contentQuality.professionalRelevance,
              justification:         insights.analyzers.contentQuality.justification,
            }
          : undefined,
        starAlignment: insights.analyzers.starAlignment
          ? { starAlignmentScore: insights.analyzers.starAlignment.starAlignmentScore }
          : undefined,
        fillerWords: insights.analyzers.fillerWords
          ? {
              total:     insights.analyzers.fillerWords.total,
              density:   insights.analyzers.fillerWords.density,
              perMinute: insights.analyzers.fillerWords.perMinute,
            }
          : undefined,
        confidence: insights.analyzers.confidence
          ? {
              confidenceScore: insights.analyzers.confidence.confidenceScore,
              fluencyScore:    insights.analyzers.confidence.fluencyScore,
            }
          : undefined,
      },
      readiness,
      gemini: deps.gemini,
    });

    // 3) Aggregate "insights" subdoc.
    const aggregate = consolidateArtifact({
      analyzers: insights.analyzers,
      readiness,
      coaching,
    });

    // 4) Persist (idempotent — same doc upserted, version bumped).
    const updated = (await InterviewInsights.findOneAndUpdate(
      { interviewJobId: job._id },
      {
        $set: {
          readiness,
          coaching,
          insights: aggregate,
        },
        $inc: { version: 1 },
      },
      { new: true }
    )) as IInterviewInsights;

    // 5) DNA enrichment — best-effort. Failure here shouldn't fail the
    //    whole synthesis (the interview report is still useful even if DNA
    //    isn't updated for some reason).
    let dnaVersion: number | undefined;
    try {
      const dnaResult = await enrichDnaFromInterview({
        userId:         job.userId.toString(),
        interviewJobId: args.jobId,
        transcript,
        readinessScore: readiness.readinessScore,
      });
      dnaVersion = dnaResult.noPriorDna ? undefined : dnaResult.dnaVersion;
    } catch (dnaErr) {
      appLogger.warn("DNA enrichment failed — continuing with synthesis", {
        jobId: args.jobId,
        error: dnaErr instanceof Error ? dnaErr.message : dnaErr,
      });
    }

    // 6) Mark the job Completed.
    job.status = "Completed";
    await job.save();

    // 7) Emit analysis-completed.
    await deps.events.publish({
      topic:         ANALYSIS_COMPLETED_TOPIC,
      correlationId: job.correlationId,
      occurredAt:    new Date(),
      payload: {
        jobId:          args.jobId,
        userId:         job.userId.toString(),
        readinessScore: readiness.readinessScore,
        dnaVersion,
      },
    });

    appLogger.info("Interview synthesis complete", {
      jobId:          args.jobId,
      readinessScore: readiness.readinessScore,
      dnaVersion,
      correlationId:  job.correlationId,
    });

    return {
      jobId:          args.jobId,
      insightsId:     (updated._id as { toString(): string }).toString(),
      readinessScore: readiness.readinessScore,
      dnaVersion,
    };
  } catch (err) {
    job.status       = "Failed";
    job.errorMessage = err instanceof Error ? err.message : String(err);
    await job.save().catch((saveErr) => {
      appLogger.error("Failed to mark interview job as Failed", {
        jobId: args.jobId,
        saveErr,
      });
    });
    throw err;
  }
}
