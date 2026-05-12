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

import { createInterviewJob, MEDIA_INGESTED_TOPIC } from "../../features/interview/services/jobService.js";
import { InterviewJob } from "../../features/interview/models/interviewJob.model.js";

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

function makeMockFiles(overrides: Partial<IFileService> = {}): {
  files:     IFileService;
  putBuffer: jest.Mock;
  remove:    jest.Mock;
} {
  const putBuffer = jest.fn<Promise<FilePutResult>, [Parameters<IFileService["putBuffer"]>[0]]>();
  const remove    = jest.fn<Promise<void>, [string]>();

  const files: IFileService = {
    putBuffer,
    getBuffer: jest.fn<Promise<Buffer>, [string]>(),
    delete:    remove,
    ...overrides,
  };

  return { files, putBuffer, remove };
}

function makeMockEventBus(): {
  events:  IEventBus;
  publish: jest.Mock;
} {
  const publish = jest.fn<Promise<void>, [EventEnvelope<unknown>]>();
  publish.mockResolvedValue(undefined);
  return { events: { publish }, publish };
}

describe("createInterviewJob", () => {
  it("creates a Pending job, stores the media, and publishes media-ingested", async () => {
    const userId = new Types.ObjectId().toString();

    const { files, putBuffer } = makeMockFiles();
    putBuffer.mockImplementation(async (args) => ({
      key:       args.key,
      url:       `http://minio.local/${args.key}`,
      sizeBytes: args.buffer.length,
      mimeType:  args.mimeType,
    }));

    const { events, publish } = makeMockEventBus();

    const result = await createInterviewJob({
      userId,
      buffer:    Buffer.from("fake-audio-bytes"),
      mimeType:  "audio/mpeg",
      mediaType: "audio",
      files,
      events,
    });

    expect(result.status).toBe("Pending");
    expect(result.mediaType).toBe("audio");
    expect(result.storageKey).toBe(`interviews/${userId}/${result.jobId}/raw.mp3`);
    expect(result.correlationId).toMatch(/^[0-9a-f-]{36}$/);

    // Persisted job
    const persisted = await InterviewJob.findById(result.jobId);
    expect(persisted).not.toBeNull();
    expect(persisted!.status).toBe("Pending");
    expect(persisted!.mediaFileKey).toBe(result.storageKey);
    expect(persisted!.userId.toString()).toBe(userId);
    expect(persisted!.correlationId).toBe(result.correlationId);

    // Published event
    expect(publish).toHaveBeenCalledTimes(1);
    const envelope = publish.mock.calls[0][0];
    expect(envelope.topic).toBe(MEDIA_INGESTED_TOPIC);
    expect(envelope.correlationId).toBe(result.correlationId);
    expect(envelope.payload).toMatchObject({
      jobId:      result.jobId,
      userId,
      storageKey: result.storageKey,
      mediaType:  "audio",
      mimeType:   "audio/mpeg",
    });
  });

  it("marks the job Failed when the upload fails, and does not publish", async () => {
    const userId = new Types.ObjectId().toString();

    const { files, putBuffer, remove } = makeMockFiles();
    const uploadErr = new Error("S3 down");
    putBuffer.mockRejectedValue(uploadErr);
    remove.mockResolvedValue(undefined);

    const { events, publish } = makeMockEventBus();

    await expect(
      createInterviewJob({
        userId,
        buffer:    Buffer.from("x"),
        mimeType:  "audio/mpeg",
        mediaType: "audio",
        files,
        events,
      })
    ).rejects.toBe(uploadErr);

    expect(publish).not.toHaveBeenCalled();

    const jobs = await InterviewJob.find({ userId: new Types.ObjectId(userId) });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe("Failed");
    expect(jobs[0].errorMessage).toBe("S3 down");
  });

  it("uses the right extension for video uploads", async () => {
    const userId = new Types.ObjectId().toString();

    const { files, putBuffer } = makeMockFiles();
    putBuffer.mockImplementation(async (args) => ({
      key:       args.key,
      url:       `http://minio.local/${args.key}`,
      sizeBytes: args.buffer.length,
      mimeType:  args.mimeType,
    }));

    const { events } = makeMockEventBus();

    const result = await createInterviewJob({
      userId,
      buffer:    Buffer.from("v"),
      mimeType:  "video/mp4",
      mediaType: "video",
      files,
      events,
    });

    expect(result.storageKey).toMatch(/raw\.mp4$/);
  });
});
