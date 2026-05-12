import type { IFileService, FilePutResult } from "../../common/services/files/IFileService.js";
import { streamInterviewMedia } from "../../features/interview/services/uploadStream.js";

function makeMockFiles(): {
  files:     IFileService;
  putBuffer: jest.Mock;
  getBuffer: jest.Mock;
  remove:    jest.Mock;
} {
  const putBuffer = jest.fn<Promise<FilePutResult>, [Parameters<IFileService["putBuffer"]>[0]]>();
  const getBuffer = jest.fn<Promise<Buffer>, [string]>();
  const remove    = jest.fn<Promise<void>, [string]>();

  const files: IFileService = {
    putBuffer,
    getBuffer,
    delete: remove,
  };

  return { files, putBuffer, getBuffer, remove };
}

describe("streamInterviewMedia", () => {
  it("uploads under interviews/{userId}/{jobId}/raw.{ext}", async () => {
    const { files, putBuffer } = makeMockFiles();
    putBuffer.mockResolvedValue({
      key:       "interviews/user-1/job-1/raw.mp3",
      url:       "http://minio.local/bucket/interviews/user-1/job-1/raw.mp3",
      sizeBytes: 10,
      mimeType:  "audio/mpeg",
    });

    const result = await streamInterviewMedia({
      files,
      userId:   "user-1",
      jobId:    "job-1",
      mimeType: "audio/mpeg",
      buffer:   Buffer.from("fake-audio"),
    });

    expect(putBuffer).toHaveBeenCalledTimes(1);
    expect(putBuffer.mock.calls[0][0]).toEqual({
      key:      "interviews/user-1/job-1/raw.mp3",
      buffer:   Buffer.from("fake-audio"),
      mimeType: "audio/mpeg",
    });
    expect(result).toEqual({
      storageKey: "interviews/user-1/job-1/raw.mp3",
      sizeBytes:  10,
      mimeType:   "audio/mpeg",
    });
  });

  it("uses the right extension for each supported mime type", async () => {
    const { files, putBuffer } = makeMockFiles();
    putBuffer.mockImplementation(async (args) => ({
      key:       args.key,
      url:       `http://minio.local/${args.key}`,
      sizeBytes: args.buffer.length,
      mimeType:  args.mimeType,
    }));

    const cases: Array<[string, string]> = [
      ["audio/mpeg",      "mp3"],
      ["audio/wav",       "wav"],
      ["audio/mp4",       "m4a"],
      ["video/mp4",       "mp4"],
      ["video/quicktime", "mov"],
      ["video/webm",      "webm"],
    ];

    for (const [mime, ext] of cases) {
      await streamInterviewMedia({
        files,
        userId:   "u",
        jobId:    "j",
        mimeType: mime,
        buffer:   Buffer.from("x"),
      });
      const lastCall = putBuffer.mock.calls[putBuffer.mock.calls.length - 1][0];
      expect(lastCall.key).toBe(`interviews/u/j/raw.${ext}`);
    }
  });

  it("falls back to .bin for an unknown mime type", async () => {
    const { files, putBuffer } = makeMockFiles();
    putBuffer.mockResolvedValue({
      key:       "interviews/u/j/raw.bin",
      url:       "http://minio.local/interviews/u/j/raw.bin",
      sizeBytes: 1,
      mimeType:  "audio/x-experimental",
    });

    await streamInterviewMedia({
      files,
      userId:   "u",
      jobId:    "j",
      mimeType: "audio/x-experimental",
      buffer:   Buffer.from("x"),
    });

    expect(putBuffer.mock.calls[0][0].key).toBe("interviews/u/j/raw.bin");
  });

  it("attempts cleanup and rethrows when the upload fails", async () => {
    const { files, putBuffer, remove } = makeMockFiles();
    const uploadErr = new Error("S3 down");
    putBuffer.mockRejectedValue(uploadErr);
    remove.mockResolvedValue(undefined);

    await expect(
      streamInterviewMedia({
        files,
        userId:   "u",
        jobId:    "j",
        mimeType: "audio/mpeg",
        buffer:   Buffer.from("x"),
      })
    ).rejects.toBe(uploadErr);

    expect(remove).toHaveBeenCalledWith("interviews/u/j/raw.mp3");
  });

  it("does not throw if cleanup itself fails", async () => {
    const { files, putBuffer, remove } = makeMockFiles();
    const uploadErr = new Error("S3 down");
    putBuffer.mockRejectedValue(uploadErr);
    remove.mockRejectedValue(new Error("delete also down"));

    await expect(
      streamInterviewMedia({
        files,
        userId:   "u",
        jobId:    "j",
        mimeType: "audio/mpeg",
        buffer:   Buffer.from("x"),
      })
    ).rejects.toBe(uploadErr);
  });
});
