import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../../../common/middlewares/asyncHandler.js";
import { requireAuth } from "../../../common/middlewares/requireAuth.js";
import { validateUploads } from "../../../common/middlewares/validateUploads.js";
import { uploadFileToS3 } from "../../../common/services/s3Upload.js";
import { ZipProcessor, type ZipScanResult } from "../../../common/utils/zipProcessor.js";
import { AssignmentService, type UploadedFile, type AssignmentFileRole } from "../../assignment/services/assignmentService.js";
import { InterviewInsights } from "../../interview/models/interviewInsights.model.js";
import type { StoragePath } from "../../../common/services/s3Upload.js";
import { appLogger } from "../../../common/services/logger.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    // 200 MB: large enough for interview audio/video recordings.
    // Per-field size constraints are enforced in validateUploads middleware.
    fileSize: 200 * 1024 * 1024,
    files: 10,
  },
});

const FIELD_TO_PATH: Record<string, StoragePath> = {
  resumes: "resumes",
  assignments: "assignments",
  interviews: "interviews",
};

const router = Router();

router.post(
  "/",
  // Authenticate BEFORE multer so unauthenticated requests are rejected
  // without buffering up to 50MB of upload into memory.
  requireAuth,
  upload.fields([
    { name: "resumes", maxCount: 5 },
    { name: "assignments", maxCount: 5 },
    { name: "interviews", maxCount: 5 },
  ]),
  validateUploads,
  asyncHandler(async (req, res) => {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;

    if (!files || Object.keys(files).length === 0) {
      res.status(400).json({ 
        error: {
          code: "NO_FILES", 
          message: "No files provided"
        },
        requestId: req.requestId ?? "-"
      });
      return;
    }

    // Each task resolves to the S3 result plus the assignment role (if any) that
    // the client declared via the file's `requirement-`/`solution-` name prefix.
    const uploadTasks: Promise<{ role: AssignmentFileRole | null; uploaded: UploadedFile }>[] = [];
    const zipScanResults: Record<string, ZipScanResult> = {};

    // Pre-generate assignment/interview IDs and get user ID for uploads.
    // requireAuth guarantees req.user is populated with a verified JWT identity,
    // so we never trust a client-supplied x-user-id header here.
    const userId = req.user!.id;
    const { Types } = await import('mongoose');

    let assignmentId: string | undefined = undefined;
    const hasAssignmentFiles = !!(files['assignments']?.length);
    if (hasAssignmentFiles) {
      // Enforce the per-user daily cap BEFORE uploading anything to S3, so a
      // capped user never consumes storage or the shared Gemini quota.
      const withinLimit = await AssignmentService.isWithinDailyLimit(userId);
      if (!withinLimit) {
        res.status(429).json({
          error: {
            code: "ASSIGNMENT_DAILY_LIMIT",
            message: `You've reached the daily limit of ${AssignmentService.MAX_ASSIGNMENTS_PER_DAY} assignment submissions. Please try again later.`
          },
          requestId: req.requestId ?? "-"
        });
        return;
      }

      assignmentId = new Types.ObjectId().toString();
      appLogger.info('Pre-generated assignment ID for upload', { assignmentId, userId });
    }

    // Pre-generate interview IDs (one per file, tracked alongside task index)
    const interviewMeta: Array<{ preGeneratedId: string; taskIndex: number }> = [];

    // Upload all files to S3 with userId and domain IDs for organization
    for (const [field, list] of Object.entries(files)) {
      const path = FIELD_TO_PATH[field];
      if (!path) continue;

      for (const file of list) {
        if (field === 'interviews') {
          const interviewId = new Types.ObjectId().toString();
          interviewMeta.push({ preGeneratedId: interviewId, taskIndex: uploadTasks.length });
          uploadTasks.push(
            uploadFileToS3({ file, path, userId, interviewId })
              .then((uploaded) => ({ role: null, uploaded }))
          );
          continue;
        }

        // Role is taken from the client-declared name prefix, not sniffed later.
        const role = field === 'assignments'
          ? AssignmentService.roleFromUploadName(file.originalname)
          : null;

        // Check if this is a ZIP file for assignments (still scan for validation)
        const isZipFile = (file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed');

        if (isZipFile && field === 'assignments') {
          // Quick validation scan for ZIP files
          const scanTask = ZipProcessor.scanZipFile(file.buffer)
            .then((scanResult) => {
              zipScanResults[file.originalname] = scanResult;

              if (!scanResult.isValid) {
                appLogger.warn(`ZIP scan failed for ${file.originalname}:`, scanResult.errors);
              } else {
                appLogger.info(`ZIP validation passed for ${file.originalname}:`, {
                  language: scanResult.detectedLanguage,
                  scope: scanResult.projectScope,
                  sourceFiles: scanResult.sourceFiles.length
                });
              }

              // Upload file to S3 with userId and assignmentId
              return uploadFileToS3({ file, path, userId, assignmentId });
            })
            .catch((error) => {
              appLogger.error(`ZIP processing failed for ${file.originalname}:`, error);
              // Continue with normal file upload even if ZIP processing fails
              return uploadFileToS3({ file, path, userId, assignmentId });
            })
            .then((uploaded) => ({ role, uploaded }));

          uploadTasks.push(scanTask);
        } else {
          // Normal file upload (with userId/assignmentId for assignments)
          const uploadParams = field === 'assignments'
            ? { file, path, userId, assignmentId }
            : { file, path };
          uploadTasks.push(
            uploadFileToS3(uploadParams).then((uploaded) => ({ role, uploaded }))
          );
        }
      }
    }

    try {
      const taskResults = await Promise.all(uploadTasks);
      const uploadResults = taskResults.map((r) => r.uploaded);
      
      // Prepare base response
      const response: any = {
        count: uploadResults.length,
        files: uploadResults,
      };
      
      if (Object.keys(zipScanResults).length > 0) {
        response.zipAnalysis = zipScanResults;
      }

      // Check if this is an assignment upload (contains assignment files)
      const assignmentResults = taskResults.filter((r) =>
        r.uploaded.key.startsWith('assignments/')
      );

      if (assignmentResults.length > 0 && assignmentId) {
        // This is an assignment upload - create assignment with the pre-generated ID
        try {
          const notes = typeof req.body?.notes === 'string' ? req.body.notes : undefined;

          // Roles were declared by the client per file; map them directly.
          const categorizedFiles: { requirements?: UploadedFile; solution?: UploadedFile } = {};
          for (const { role, uploaded } of assignmentResults) {
            if (role === 'requirements') categorizedFiles.requirements = uploaded;
            else if (role === 'solution') categorizedFiles.solution = uploaded;
          }

          if (categorizedFiles.solution) {
            const assignmentResult = await AssignmentService.createAssignment(userId, {
              requirements: categorizedFiles.requirements,
              solution: categorizedFiles.solution
            }, notes, assignmentId);

            response.assignment = {
              id: assignmentResult.assignmentId,
              status: assignmentResult.status,
              analysisTriggered: assignmentResult.analysisTriggered
            };

            appLogger.info('Assignment created from upload', {
              assignmentId: assignmentResult.assignmentId,
              userId,
              filesCount: assignmentResults.length
            });
          }
        } catch (error) {
          appLogger.error('Assignment creation failed during upload:', error);
          // Don't fail the entire upload, just log the error
          response.assignmentError = error instanceof Error
            ? error.message
            : 'Failed to create assignment record';
        }
      }

      // Create InterviewInsights records for uploaded interview files
      const interviewFiles = uploadResults.filter((file: UploadedFile) =>
        file.key.startsWith('interviews/')
      );

      if (interviewFiles.length > 0) {
        const createdInterviewIds: string[] = [];
        for (const file of interviewFiles) {
          try {
            const mediaType = file.mimeType.startsWith('video/') ? 'video' : 'audio';
            const { Types } = await import('mongoose');
            const resolvedUserId = Types.ObjectId.isValid(userId)
              ? new Types.ObjectId(userId)
              : new Types.ObjectId();
            const interview = await InterviewInsights.create({
              userId:          resolvedUserId,
              mediaFileKey:    file.key,
              mediaType,
              processingStatus: 'uploaded',
              status:           'pending',
            });
            createdInterviewIds.push(interview._id.toString());
            appLogger.info('InterviewInsights record created from upload', {
              interviewId: interview._id.toString(),
              userId,
              mediaType,
              key: file.key,
            });
          } catch (err) {
            appLogger.error('Failed to create InterviewInsights record', {
              key: file.key,
              error: err instanceof Error ? err.message : 'Unknown error',
            });
          }
        }
        if (createdInterviewIds.length > 0) {
          response.interviews = createdInterviewIds;
        }
      }

      res.status(201).json(response);
    } catch (error) {
      appLogger.error('Upload processing failed:', error);
      res.status(500).json({
        error: {
          code: "UPLOAD_FAILED",
          message: "Failed to process uploads"
        },
        requestId: req.requestId ?? "-"
      });
    }
  })
);

export default router;
