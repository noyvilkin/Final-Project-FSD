import express, { type Express } from "express";
import request from "supertest";

import interviewRoutes from "../../features/interview/routes/interview.routes.js";

function buildApp(): Express {
  const app = express();
  app.use("/api/interviews", interviewRoutes);
  return app;
}

describe("POST /api/interviews", () => {
  it("returns 400 when no file is attached", async () => {
    const res = await request(buildApp()).post("/api/interviews");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("NO_FILE");
  });

  it("returns 415 for an unsupported mime type", async () => {
    const res = await request(buildApp())
      .post("/api/interviews")
      .attach("media", Buffer.from("fake-bytes"), {
        filename: "resume.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(res.body.error.allowed).toEqual(
      expect.arrayContaining(["audio/mpeg", "video/mp4"])
    );
  });

  it("returns 202 for an allowed audio file and identifies media type", async () => {
    const res = await request(buildApp())
      .post("/api/interviews")
      .set("x-user-id", "user-123")
      .attach("media", Buffer.from("fake-audio"), {
        filename: "interview.mp3",
        contentType: "audio/mpeg",
      });

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({
      status: "accepted",
      userId: "user-123",
      mediaType: "audio",
      mimeType: "audio/mpeg",
      originalName: "interview.mp3",
    });
    expect(typeof res.body.sizeBytes).toBe("number");
  });

  it("identifies video media correctly", async () => {
    const res = await request(buildApp())
      .post("/api/interviews")
      .set("x-user-id", "user-123")
      .attach("media", Buffer.from("fake-video"), {
        filename: "interview.mp4",
        contentType: "video/mp4",
      });

    expect(res.status).toBe(202);
    expect(res.body.mediaType).toBe("video");
  });

  it("falls back to 'anonymous' userId when x-user-id header is missing", async () => {
    const res = await request(buildApp())
      .post("/api/interviews")
      .attach("media", Buffer.from("fake-audio"), {
        filename: "interview.wav",
        contentType: "audio/wav",
      });

    expect(res.status).toBe(202);
    expect(res.body.userId).toBe("anonymous");
  });
});
