import type { IFileService } from "../../../common/services/files/IFileService.js";
import { appLogger } from "../../../common/services/logger.js";

// Maps the validated mime types from the route to a file extension we use
// when building the storage key. Keep this in sync with ALLOWED_MIMES in
// features/interview/routes/interview.routes.ts.
const MIME_TO_EXT: Record<string, string> = {
  "audio/mpeg":      "mp3",
  "audio/wav":       "wav",
  "audio/mp4":       "m4a",
  "video/mp4":       "mp4",
  "video/quicktime": "mov",
  "video/webm":      "webm",
};

export interface StreamInterviewMediaArgs {
  files:    IFileService;
  userId:   string;
  jobId:    string;
  mimeType: string;
  buffer:   Buffer;
}

export interface StreamInterviewMediaResult {
  storageKey: string;
  sizeBytes:  number;
  mimeType:   string;
}

// Persists a single interview media file under
//   interviews/{userId}/{jobId}/raw.{ext}
// On failure best-effort cleans up any partial write before rethrowing,
// so the caller can fail the InterviewJob without leaking storage.
export async function streamInterviewMedia(
  args: StreamInterviewMediaArgs
): Promise<StreamInterviewMediaResult> {
  const ext = MIME_TO_EXT[args.mimeType] ?? "bin";
  const key = `interviews/${args.userId}/${args.jobId}/raw.${ext}`;

  try {
    const result = await args.files.putBuffer({
      key,
      buffer:   args.buffer,
      mimeType: args.mimeType,
    });

    appLogger.info("Interview media stored", {
      userId:    args.userId,
      jobId:     args.jobId,
      key:       result.key,
      sizeBytes: result.sizeBytes,
    });

    return {
      storageKey: result.key,
      sizeBytes:  result.sizeBytes,
      mimeType:   result.mimeType,
    };
  } catch (err) {
    appLogger.error("Interview media upload failed — attempting cleanup", {
      userId: args.userId,
      jobId:  args.jobId,
      key,
      error:  err,
    });

    try {
      await args.files.delete(key);
    } catch (cleanupErr) {
      appLogger.warn("Interview media cleanup also failed", {
        key,
        error: cleanupErr,
      });
    }

    throw err;
  }
}
