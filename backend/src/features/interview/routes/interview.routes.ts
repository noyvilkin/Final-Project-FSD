import { Router, type Request, type Response, type NextFunction } from "express";
import multer, { MulterError } from "multer";

import { asyncHandler } from "../../../common/middlewares/asyncHandler.js";
import { appLogger } from "../../../common/services/logger.js";

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
    // TODO(auth): swap the x-user-id header for a shared requireAuth middleware
    // once the cookie-based auth helper lands. Matches the convention currently
    // used by features/upload/routes/upload.routes.ts.
    const userId = (req.headers["x-user-id"] as string | undefined) ?? "anonymous";

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

    appLogger.info("Interview media ingested", {
      requestId: req.requestId ?? "-",
      userId,
      mediaType,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      originalName: file.originalname,
    });

    // Sub-tasks 1.2/1.3 will plug in: object-storage upload + InterviewJob
    // creation + Kafka publish of media-ingested. For now we acknowledge the
    // upload so the route can be exercised end-to-end.
    res.status(202).json({
      status: "accepted",
      userId,
      mediaType,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      originalName: file.originalname,
    });
  })
);

export default router;
