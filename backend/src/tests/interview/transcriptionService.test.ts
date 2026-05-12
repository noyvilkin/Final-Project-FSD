import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import type {
  EventEnvelope,
  IEventBus,
} from "../../common/services/events/IEventBus.js";
import type {
  FilePutResult,
  IFileService,
} from "../../common/services/files/IFileService.js";
import type {
  WhisperClient,
  WhisperTranscript,
} from "../../common/services/whisperClient.js";

import { InterviewJob } from "../../features/interview/models/interviewJob.model.js";
import {
  processInterviewJob,
  TRANSCRIPTION_COMPLETED_TOPIC,
} from "../../features/interview/services/transcriptionService.js";

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
});

function makeMocks() {
  const putBuffer = jest.fn<Promise<FilePutResult>, [Parameters<IFileService["putBuffer"]>[0]]>();
  const getBuffer = jest.fn<Promise<Buffer>, [string]>();
  const remove    = jest.fn<Promise<void>, [string]>();
  const files: IFileService = { putBuffer, getBuffer, delete: remove };

  const transcribe = jest.fn<Promise<WhisperTranscript>, [Parameters<WhisperClient["transcribe"]>[0]]>();
  const whisper = { transcribe } as unknown as WhisperClient;

  const publish = jest.fn<Promise<void>, [EventEnvelope<unknown>]>();
  publish.mockResolvedValue(undefined);
  const events: IEventBus = { publish };

  return { files, whisper, events, putBuffer, getBuffer, transcribe, publish };
}

async function makePendingJob(userId: string): Promise<string> {
  const job = await InterviewJob.create({
    userId:        new Types.ObjectId(userId),
    mediaFileKey:  `interviews/${userId}/job/raw.mp3`,
    mediaType:     "audio",
    mimeType:      "audio/mpeg",
    sizeBytes:     100,
    status:        "Pending",
    correlationId: "corr-1",
  });
  return (job._id as Types.ObjectId).toString();
}

describe("processInterviewJob", () => {
  it("downloads media, transcribes, writes transcript.json, marks Transcribed, and emits the event", async () => {
    const userId = new Types.ObjectId().toString();
    const jobId  = await makePendingJob(userId);

    const { whisper, files, events, getBuffer, putBuffer, transcribe, publish } = makeMocks();

    getBuffer.mockResolvedValue(Buffer.from("fake-media"));
    transcribe.mockResolvedValue({
      text:             "Hello world.",
      segments:         [{ start: 0, end: 1, text: "Hello world." }],
      languageDetected: "en",
      durationSeconds:  1,
    });
    putBuffer.mockImplementation(async (args) => ({
      key:       args.key,
      url:       `http://minio.local/${args.key}`,
      sizeBytes: args.buffer.length,
      mimeType:  args.mimeType,
    }));

    const result = await processInterviewJob(jobId, { whisper, files, events });

    expect(result.status).toBe("Transcribed");
    expect(result.transcriptKey).toBe(`interviews/${userId}/${jobId}/transcript.json`);
    expect(result.durationSeconds).toBe(1);
    expect(result.skipped).toBeUndefined();

    // Job persisted
    const updated = await InterviewJob.findById(jobId);
    expect(updated!.status).toBe("Transcribed");
    expect(updated!.transcriptKey).toBe(result.transcriptKey);
    expect(updated!.durationSeconds).toBe(1);

    // Media downloaded once
    expect(getBuffer).toHaveBeenCalledWith(`interviews/${userId}/job/raw.mp3`);

    // Transcript JSON uploaded
    expect(putBuffer).toHaveBeenCalledTimes(1);
    const uploaded = putBuffer.mock.calls[0][0];
    expect(uploaded.key).toBe(result.transcriptKey);
    expect(uploaded.mimeType).toBe("application/json");
    const parsedJson = JSON.parse(uploaded.buffer.toString("utf-8"));
    expect(parsedJson.text).toBe("Hello world.");
    expect(parsedJson.segments).toHaveLength(1);

    // Event published
    expect(publish).toHaveBeenCalledTimes(1);
    const envelope = publish.mock.calls[0][0];
    expect(envelope.topic).toBe(TRANSCRIPTION_COMPLETED_TOPIC);
    expect(envelope.correlationId).toBe("corr-1");
    expect(envelope.payload).toMatchObject({
      jobId,
      userId,
      transcriptKey:   result.transcriptKey,
      durationSeconds: 1,
    });
  });

  it("is idempotent — skips when the job is already Transcribed", async () => {
    const userId = new Types.ObjectId().toString();
    const jobId  = await makePendingJob(userId);
    await InterviewJob.findByIdAndUpdate(jobId, {
      status:        "Transcribed",
      transcriptKey: "existing/transcript.json",
    });

    const { whisper, files, events, transcribe, publish } = makeMocks();

    const result = await processInterviewJob(jobId, { whisper, files, events });

    expect(result.skipped).toBe(true);
    expect(result.transcriptKey).toBe("existing/transcript.json");
    expect(transcribe).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("marks the job Failed when Whisper throws and does not publish", async () => {
    const userId = new Types.ObjectId().toString();
    const jobId  = await makePendingJob(userId);

    const { whisper, files, events, getBuffer, transcribe, publish } = makeMocks();
    getBuffer.mockResolvedValue(Buffer.from("fake-media"));
    const err = new Error("Whisper API down");
    transcribe.mockRejectedValue(err);

    await expect(processInterviewJob(jobId, { whisper, files, events })).rejects.toBe(err);

    const updated = await InterviewJob.findById(jobId);
    expect(updated!.status).toBe("Failed");
    expect(updated!.errorMessage).toBe("Whisper API down");

    expect(publish).not.toHaveBeenCalled();
  });

  it("marks the job Failed when storage download fails", async () => {
    const userId = new Types.ObjectId().toString();
    const jobId  = await makePendingJob(userId);

    const { whisper, files, events, getBuffer, transcribe } = makeMocks();
    const err = new Error("S3 read failed");
    getBuffer.mockRejectedValue(err);

    await expect(processInterviewJob(jobId, { whisper, files, events })).rejects.toBe(err);

    const updated = await InterviewJob.findById(jobId);
    expect(updated!.status).toBe("Failed");
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("throws when the job doesn't exist", async () => {
    const fakeId = new Types.ObjectId().toString();
    const { whisper, files, events } = makeMocks();
    await expect(processInterviewJob(fakeId, { whisper, files, events })).rejects.toThrow(/not found/);
  });
});
