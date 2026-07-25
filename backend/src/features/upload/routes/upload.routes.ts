import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../../../common/middlewares/asyncHandler.js";
import { requireAuth } from "../../../common/middlewares/requireAuth.js";
import { validateUploads } from "../../../common/middlewares/validateUploads.js";
import { uploadFileToS3 } from "../../../common/services/s3Upload.js";
import { ZipProcessor, type ZipScanResult } from "../../../common/utils/zipProcessor.js";
import { AssignmentService, type UploadedFile } from "../../assignment/services/assignmentService.js";
import type { StoragePath } from "../../../common/services/s3Upload.js";
import { appLogger } from "../../../common/services/logger.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB to support ZIP files
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

    const uploadTasks: Promise<any>[] = [];
    const zipScanResults: Record<string, ZipScanResult> = {};
    
    // Pre-generate assignment ID and get user ID for assignment uploads.
    // requireAuth guarantees req.user is populated with a verified JWT identity,
    // so we never trust a client-supplied x-user-id header here.
    const userId = req.user!.id;
    let assignmentId: string | undefined = undefined;
    
    // Check if this is an assignment upload
    const hasAssignmentFiles = files['assignments'] && files['assignments'].length > 0;
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

      // Pre-generate assignment ID using MongoDB ObjectId format
      const { Types } = await import('mongoose');
      assignmentId = new Types.ObjectId().toString();
      appLogger.info('Pre-generated assignment ID for upload', { assignmentId, userId });
    }

    // Upload all files to S3 with userId and assignmentId for organization
    for (const [field, list] of Object.entries(files)) {
      const path = FIELD_TO_PATH[field];
      if (!path) continue;

      for (const file of list) {
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
            });
            
          uploadTasks.push(scanTask);
        } else {
          // Normal file upload (with userId/assignmentId for assignments)
          const uploadParams = field === 'assignments' 
            ? { file, path, userId, assignmentId }
            : { file, path };
          uploadTasks.push(uploadFileToS3(uploadParams));
        }
      }
    }

    try {
      const uploadResults = await Promise.all(uploadTasks);
      
      // Prepare base response
      const response: any = {
        count: uploadResults.length,
        files: uploadResults,
      };
      
      if (Object.keys(zipScanResults).length > 0) {
        response.zipAnalysis = zipScanResults;
      }

      // Check if this is an assignment upload (contains assignment files)
      const assignmentFiles = uploadResults.filter((file: UploadedFile) => 
        file.key.startsWith('assignments/')
      );

      if (assignmentFiles.length > 0 && assignmentId) {
        // This is an assignment upload - create assignment with the pre-generated ID
        try {
          const notes = typeof req.body?.notes === 'string' ? req.body.notes : undefined;
          
          const categorizedFiles = AssignmentService.categorizeUploadedFiles(assignmentFiles);
          
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
              filesCount: assignmentFiles.length
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
