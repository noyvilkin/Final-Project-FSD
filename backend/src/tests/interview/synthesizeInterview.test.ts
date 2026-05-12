import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import type {
  EventEnvelope,
  IEventBus,
} from "../../common/services/events/IEventBus.js";
import type { GeminiClient } from "../../common/services/geminiClient.js";

import { InterviewJob } from "../../features/interview/models/interviewJob.model.js";
import { InterviewInsights } from "../../features/interview/models/interviewInsights.model.js";
import { ProfessionalDNA } from "../../features/resume/models/professionalDNA.model.js";
import {
  synthesizeInterview,
  ANALYSIS_COMPLETED_TOPIC,
} from "../../features/interview/services/synthesizeInterview.js";

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await InterviewJob.deleteMany({});
  await InterviewInsights.deleteMany({});
  await ProfessionalDNA.deleteMany({});
});

function makeMocks() {
  const generate = jest.fn<Promise<string>, [unknown]>();
  const gemini   = { generate } as unknown as GeminiClient;

  const publish = jest.fn<Promise<void>, [EventEnvelope<unknown>]>();
  publish.mockResolvedValue(undefined);
  const events: IEventBus = { publish };

  return { gemini, events, generate, publish };
}

const COACHING_RESPONSE = JSON.stringify({
  tips: [
    { type: "verbal",     issue: "filler density",    suggestion: "pause more" },
    { type: "behavioral", issue: "missing result",    suggestion: "lead with metric" },
  ],
});

async function seedAnalyzedJobWithInsights(userId: string): Promise<string> {
  const job = await InterviewJob.create({
    userId:        new Types.ObjectId(userId),
    mediaFileKey:  `interviews/${userId}/job/raw.mp3`,
    mediaType:     "audio",
    mimeType:      "audio/mpeg",
    sizeBytes:     100,
    status:        "Analyzed",
    correlationId: "corr-1",
    transcriptKey: `interviews/${userId}/job/transcript.json`,
    durationSeconds: 60,
  });
  const jobId = (job._id as Types.ObjectId).toString();

  await InterviewInsights.create({
    userId:         new Types.ObjectId(userId),
    interviewJobId: job._id,
    transcript:     "I led the migration to TypeScript and shipped it.",
    analyzers: {
      contentQuality: {
        technicalAccuracy:     80,
        professionalRelevance: 90,
        justification:         "x",
        promptVersion:         "v1",
      },
      starAlignment: {
        segments:           [],
        starAlignmentScore: 70,
        promptVersion:      "v1",
      },
      fillerWords: {
        counts:     { um: 1 },
        total:      1,
        totalWords: 12,
        density:    8.3,
        perMinute:  1,
      },
      confidence: {
        confidenceScore: 75,
        fluencyScore:    65,
        signals: { polarityAverage: 1, polarityScore: 60, fillerDensity: 8.3, wordsPerMinute: 12 },
      },
      analyzedAt: new Date(),
    },
    version: 1,
  });

  return jobId;
}

describe("synthesizeInterview", () => {
  it("computes readiness, generates coaching, persists everything, and emits the event", async () => {
    const userId = new Types.ObjectId().toString();
    const jobId  = await seedAnalyzedJobWithInsights(userId);

    const { gemini, events, generate, publish } = makeMocks();
    generate.mockResolvedValue(COACHING_RESPONSE);

    const result = await synthesizeInterview({ jobId }, { gemini, events });

    expect(result.readinessScore).toBeGreaterThan(0);
    expect(result.skipped).toBeUndefined();

    const job = await InterviewJob.findById(jobId);
    expect(job!.status).toBe("Completed");

    const insights = await InterviewInsights.findOne({ interviewJobId: jobId });
    expect(insights!.readiness?.readinessScore).toBe(result.readinessScore);
    expect(insights!.coaching?.tips).toHaveLength(2);
    expect(insights!.insights?.overallScore).toBeGreaterThan(0);

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0].topic).toBe(ANALYSIS_COMPLETED_TOPIC);
    expect(publish.mock.calls[0][0].correlationId).toBe("corr-1");
  });

  it("is idempotent — skips when the job is already Completed", async () => {
    const userId = new Types.ObjectId().toString();
    const jobId  = await seedAnalyzedJobWithInsights(userId);
    await InterviewJob.findByIdAndUpdate(jobId, { status: "Completed" });

    const { gemini, events, generate, publish } = makeMocks();

    const result = await synthesizeInterview({ jobId }, { gemini, events });

    expect(result.skipped).toBe(true);
    expect(generate).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("rejects jobs not in 'Analyzed' state", async () => {
    const userId = new Types.ObjectId().toString();
    const jobId  = await seedAnalyzedJobWithInsights(userId);
    await InterviewJob.findByIdAndUpdate(jobId, { status: "Pending" });

    const { gemini, events } = makeMocks();

    await expect(
      synthesizeInterview({ jobId }, { gemini, events })
    ).rejects.toThrow(/requires 'Analyzed'/);
  });

  it("enriches DNA when the user has prior DNA", async () => {
    const userId = new Types.ObjectId().toString();
    const jobId  = await seedAnalyzedJobWithInsights(userId);

    await ProfessionalDNA.create({
      userId:     new Types.ObjectId(userId),
      skills: [
        { name: "TypeScript", category: "technical", proficiencyLevel: "intermediate" },
      ],
      experience: [],
      education:  [],
      analysisStatus: "completed",
      dnaVersion: 1,
    });

    const { gemini, events, generate } = makeMocks();
    generate.mockResolvedValue(COACHING_RESPONSE);

    const result = await synthesizeInterview({ jobId }, { gemini, events });

    expect(result.dnaVersion).toBe(2);
    const updatedDna = await ProfessionalDNA.findOne({
      userId: new Types.ObjectId(userId),
      dnaVersion: 2,
    });
    expect(updatedDna!.skills[0].proficiencyLevel).toBe("advanced");
  });

  it("does not fail synthesis when DNA enrichment errors", async () => {
    const userId = new Types.ObjectId().toString();
    const jobId  = await seedAnalyzedJobWithInsights(userId);
    // No DNA seeded → enrichDnaFromInterview returns noPriorDna, which is
    // graceful (no throw). dnaVersion will be undefined on the result.

    const { gemini, events, generate } = makeMocks();
    generate.mockResolvedValue(COACHING_RESPONSE);

    const result = await synthesizeInterview({ jobId }, { gemini, events });

    expect(result.dnaVersion).toBeUndefined();
    const job = await InterviewJob.findById(jobId);
    expect(job!.status).toBe("Completed");
  });

  it("marks job Failed and rethrows when coaching Gemini call fails", async () => {
    const userId = new Types.ObjectId().toString();
    const jobId  = await seedAnalyzedJobWithInsights(userId);

    const { gemini, events, generate, publish } = makeMocks();
    generate.mockRejectedValue(new Error("Gemini down"));

    await expect(
      synthesizeInterview({ jobId }, { gemini, events })
    ).rejects.toThrow(/Gemini down/);

    const job = await InterviewJob.findById(jobId);
    expect(job!.status).toBe("Failed");
    expect(publish).not.toHaveBeenCalled();
  });
});
