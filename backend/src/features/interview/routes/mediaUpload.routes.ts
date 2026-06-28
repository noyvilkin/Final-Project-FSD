import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { asyncHandler } from '../../../common/middlewares/asyncHandler.js';
import { uploadMediaToS3, deleteFileFromS3 } from '../../../common/services/s3Upload.js';
import { InterviewService } from '../services/interviewService.js';
import { appLogger } from '../../../common/services/logger.js';

const MAX_MEDIA_SIZE = 500 * 1024 * 1024; // 500 MB

const ALLOWED_AUDIO_MIMES = [
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg',
  'audio/webm', 'audio/aac', 'audio/mp4', 'audio/x-m4a', 'audio/flac',
];

const ALLOWED_VIDEO_MIMES = [
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
  'video/x-matroska', 'video/ogg', 'video/mpeg',
];

const ALLOWED_MEDIA_MIMES = [...ALLOWED_AUDIO_MIMES, ...ALLOWED_VIDEO_MIMES];

// Use disk storage so large files are not buffered in memory
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, tmpdir()),
  filename: (_req, _file, cb) => cb(null, `media-${randomUUID()}`),
});

const mediaUpload = multer({
  storage,
  limits: { fileSize: MAX_MEDIA_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype.startsWith('audio/') ||
      file.mimetype.startsWith('video/') ||
      ALLOWED_MEDIA_MIMES.includes(file.mimetype)
    ) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported media type: ${file.mimetype}`));
    }
  },
});

const router = Router();

/**
 * POST /api/interviews/upload
 *
 * Dedicated media upload endpoint for large audio/video files.
 * Uses disk-based multer storage and S3 multipart upload to handle
 * files up to 500 MB without exhausting server memory.
 *
 * Headers:
 *   x-user-id: string (required)
 *
 * Body (multipart/form-data):
 *   media: File (required) — audio or video file
 *   jobId: string (optional) — job context for the interview
 */
router.post(
  '/upload',
  mediaUpload.single('media'),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      res.status(400).json({
        error: { code: 'MISSING_USER_ID', message: 'x-user-id header is required' },
        requestId: req.requestId ?? '-',
      });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({
        error: { code: 'NO_FILE', message: 'No media file provided' },
        requestId: req.requestId ?? '-',
      });
      return;
    }

    const { Types } = await import('mongoose');
    const interviewId = new Types.ObjectId().toString();
    const mediaType = file.mimetype.startsWith('audio/') ? 'audio' as const : 'video' as const;
    const jobId = typeof req.body?.jobId === 'string' ? req.body.jobId.trim() : undefined;

    let s3Key: string | null = null;

    try {
      // 1. Upload to S3 (streaming multipart for large files)
      const s3Result = await uploadMediaToS3({
        filePath: file.path,
        originalName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        storagePath: 'interviews',
        userId,
        interviewId,
      });
      s3Key = s3Result.key;

      // 2. Create interview record in DB
      const interview = await InterviewService.createInterview(
        userId,
        s3Result.key,
        mediaType,
        jobId || undefined,
        interviewId,
        file.size,
        file.mimetype,
      );

      appLogger.info('[media-upload] Interview created', {
        interviewId: interview.interviewId,
        userId,
        mediaType,
        fileSize: file.size,
        requestId: req.requestId,
      });

      res.status(201).json({
        interview: {
          id: interview.interviewId,
          status: interview.status,
        },
        file: {
          key: s3Result.key,
          url: s3Result.url,
          mimeType: file.mimetype,
          size: file.size,
        },
        requestId: req.requestId ?? '-',
      });
    } catch (err) {
      // Clean up S3 object if DB creation failed
      if (s3Key) {
        await deleteFileFromS3(s3Key);
      }

      appLogger.error('[media-upload] Upload failed', {
        interviewId,
        userId,
        error: err instanceof Error ? err.message : String(err),
        requestId: req.requestId,
      });

      res.status(500).json({
        error: {
          code: 'MEDIA_UPLOAD_FAILED',
          message: 'Failed to process media upload',
        },
        requestId: req.requestId ?? '-',
      });
    } finally {
      // Always clean up the temp file from disk
      try {
        await unlink(file.path);
      } catch {
        // Temp file already removed or never created — not critical
      }
    }
  })
);

export default router;
