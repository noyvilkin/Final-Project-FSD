import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../../../common/middlewares/asyncHandler.js";
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

    // Upload all files to S3 first
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
              
              // Upload file to S3
              return uploadFileToS3({ file, path });
            })
            .catch((error) => {
              appLogger.error(`ZIP processing failed for ${file.originalname}:`, error);
              // Continue with normal file upload even if ZIP processing fails
              return uploadFileToS3({ file, path });
            });
            
          uploadTasks.push(scanTask);
        } else {
          // Normal file upload
          uploadTasks.push(uploadFileToS3({ file, path }));
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

      if (assignmentFiles.length > 0) {
        // This is an assignment upload - create assignment and trigger analysis
        try {
          // For now, assume userId is in request context (you may need to add auth middleware)
          // This is a placeholder - you'll need to get the actual user ID from your auth system
          const userId = req.headers['x-user-id'] as string || 'anonymous';
          const notes = typeof req.body?.notes === 'string' ? req.body.notes : undefined;
          
          const categorizedFiles = AssignmentService.categorizeUploadedFiles(assignmentFiles);
          
          if (categorizedFiles.solution) {
            const assignmentResult = await AssignmentService.createAssignment(userId, {
              requirements: categorizedFiles.requirements,
              solution: categorizedFiles.solution
            }, notes);

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
