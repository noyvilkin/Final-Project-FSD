import express, { type Express } from "express";
import request from "supertest";
import { Types } from "mongoose";

// Mock createInterviewJob so the route test doesn't need a real Mongo
// connection or event bus. The end-to-end behaviour is covered separately
// in jobService.test.ts.
jest.mock("../../features/interview/services/jobService.js", () => ({
  createInterviewJob: jest.fn(),
  MEDIA_INGESTED_TOPIC: "media-ingested",
}));

import interviewRoutes from "../../features/interview/routes/interview.routes.js";
import { createInterviewJob } from "../../features/interview/services/jobService.js";

const mockedCreate = createInterviewJob as jest.MockedFunction<typeof createInterviewJob>;

function buildApp(): Express {
  const app = express();
  app.use("/api/interviews", interviewRoutes);
  return app;
}

function fakeJobId(): string {
  return new Types.ObjectId().toString();
}

const VALID_USER_ID = new Types.ObjectId().toString();

beforeEach(() => {
  mockedCreate.mockReset();
});

describe("POST /api/interviews", () => {
  it("returns 401 when x-user-id header is missing", async () => {
    const res = await request(buildApp())
      .post("/api/interviews")
      .attach("media", Buffer.from("fake-audio"), {
        filename: "interview.mp3",
        contentType: "audio/mpeg",
      });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("returns 401 when x-user-id is not a valid ObjectId", async () => {
    const res = await request(buildApp())
      .post("/api/interviews")
      .set("x-user-id", "not-an-objectid")
      .attach("media", Buffer.from("fake-audio"), {
        filename: "interview.mp3",
        contentType: "audio/mpeg",
      });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when no file is attached", async () => {
    const res = await request(buildApp())
      .post("/api/interviews")
      .set("x-user-id", VALID_USER_ID);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("NO_FILE");
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("returns 415 for an unsupported mime type", async () => {
    const res = await request(buildApp())
      .post("/api/interviews")
      .set("x-user-id", VALID_USER_ID)
      .attach("media", Buffer.from("fake-bytes"), {
        filename: "resume.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("returns 202 with jobId + storageKey for an allowed audio file", async () => {
    const jobId = fakeJobId();
    mockedCreate.mockResolvedValue({
      jobId,
      storageKey:    `interviews/${VALID_USER_ID}/${jobId}/raw.mp3`,
      correlationId: "corr-1",
      status:        "Pending",
      sizeBytes:     10,
      mediaType:     "audio",
      mimeType:      "audio/mpeg",
    });

    const res = await request(buildApp())
      .post("/api/interviews")
      .set("x-user-id", VALID_USER_ID)
      .attach("media", Buffer.from("fake-audio"), {
        filename: "interview.mp3",
        contentType: "audio/mpeg",
      });

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({
      jobId,
      status:        "Pending",
      mediaType:     "audio",
      mimeType:      "audio/mpeg",
      correlationId: "corr-1",
    });
    expect(res.body.storageKey).toContain(`interviews/${VALID_USER_ID}/${jobId}/raw.mp3`);

    expect(mockedCreate).toHaveBeenCalledTimes(1);
    const args = mockedCreate.mock.calls[0][0];
    expect(args.userId).toBe(VALID_USER_ID);
    expect(args.mediaType).toBe("audio");
    expect(args.mimeType).toBe("audio/mpeg");
  });

  it("identifies video media correctly", async () => {
    const jobId = fakeJobId();
    mockedCreate.mockResolvedValue({
      jobId,
      storageKey:    `interviews/${VALID_USER_ID}/${jobId}/raw.mp4`,
      correlationId: "corr-2",
      status:        "Pending",
      sizeBytes:     20,
      mediaType:     "video",
      mimeType:      "video/mp4",
    });

    const res = await request(buildApp())
      .post("/api/interviews")
      .set("x-user-id", VALID_USER_ID)
      .attach("media", Buffer.from("fake-video"), {
        filename: "interview.mp4",
        contentType: "video/mp4",
      });

    expect(res.status).toBe(202);
    expect(res.body.mediaType).toBe("video");
    expect(mockedCreate.mock.calls[0][0].mediaType).toBe("video");
  });
});
