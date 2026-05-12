import { Router, type Request, type Response, type NextFunction } from "express";
import multer, { MulterError } from "multer";
import { Types } from "mongoose";

import { asyncHandler } from "../../../common/middlewares/asyncHandler.js";
import { appLogger } from "../../../common/services/logger.js";
import { getEventBus } from "../../../common/services/events/index.js";
import { getFileService } from "../../../common/services/files/index.js";

import { createInterviewJob } from "../services/jobService.js";

// ---------------------------------------------------------------------------
// Constraints
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500MB

const ALLOWED_MIMES = [
  "audio/mpeg",
  "audio/wav",
  "audio/mp4",
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

type AllowedMime = (typeof ALLOWED_MIMES)[number];

function getMediaType(mime: AllowedMime): "audio" | "video" {
  return mime.startsWith("audio/") ? "audio" : "video";
}

// ---------------------------------------------------------------------------
// Multer wrapper — translates multer-specific errors into our error shape
// ---------------------------------------------------------------------------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1,
  },
});

function uploadMedia(req: Request, res: Response, next: NextFunction): void {
  upload.single("media")(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({
          error: {
            code: "FILE_TOO_LARGE",
            message: `Media file exceeds the maximum size of ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`,
          },
          requestId: req.requestId ?? "-",
        });
        return;
      }
      res.status(400).json({
        error: { code: err.code, message: err.message },
        requestId: req.requestId ?? "-",
      });
      return;
    }
    if (err) {
      next(err);
      return;
    }
    next();
  });
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

const router = Router();

router.post(
  "/",
  uploadMedia,
  asyncHandler(async (req, res) => {
    // TODO(auth): swap the x-user-id header for a shared requireAuth
    // middleware once the cookie-based auth helper lands. Matches the
    // convention currently used by features/upload/routes/upload.routes.ts.
    const rawUserId = req.headers["x-user-id"];
    const userId    = typeof rawUserId === "string" ? rawUserId.trim() : "";

    if (!userId || !Types.ObjectId.isValid(userId)) {
      res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Missing or invalid user identity",
        },
        requestId: req.requestId ?? "-",
      });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({
        error: {
          code: "NO_FILE",
          message: "Missing 'media' file in form data",
        },
        requestId: req.requestId ?? "-",
      });
      return;
    }

    if (!ALLOWED_MIMES.includes(file.mimetype as AllowedMime)) {
      res.status(415).json({
        error: {
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: `Media type '${file.mimetype}' is not supported`,
          allowed: ALLOWED_MIMES,
        },
        requestId: req.requestId ?? "-",
      });
      return;
    }

    const mediaType = getMediaType(file.mimetype as AllowedMime);

    const result = await createInterviewJob({
      userId,
      buffer:    file.buffer,
      mimeType:  file.mimetype,
      mediaType,
      files:     getFileService(),
      events:    getEventBus(),
    });

    appLogger.info("Interview media accepted", {
      requestId:     req.requestId ?? "-",
      userId,
      jobId:         result.jobId,
      correlationId: result.correlationId,
      mediaType:     result.mediaType,
      mimeType:      result.mimeType,
      sizeBytes:     result.sizeBytes,
      originalName:  file.originalname,
    });

    res.status(202).json({
      jobId:         result.jobId,
      status:        result.status,
      mediaType:     result.mediaType,
      mimeType:      result.mimeType,
      sizeBytes:     result.sizeBytes,
      storageKey:    result.storageKey,
      correlationId: result.correlationId,
    });
  })
);

export default router;
