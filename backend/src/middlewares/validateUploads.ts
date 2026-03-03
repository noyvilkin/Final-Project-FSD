import type { Request, Response, NextFunction } from "express";
import { ZipProcessor } from "../services/zipProcessor.js";

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_ZIP_SIZE_BYTES = 50 * 1024 * 1024; // 50MB for ZIP files

const allowedMimeByField: Record<string, string[]> = {
  resumes: ["application/pdf"],
  assignments: ["application/zip", "application/x-zip-compressed", "application/pdf"],
  interviews: ["image/*", "video/*", "application/pdf"],
};

const isAllowedMime = (mimeType: string, allowed: string[]) => {
  return allowed.some((pattern) => {
    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -1);
      return mimeType.startsWith(prefix);
    }

    return mimeType === pattern;
  });
};

export const validateUploads = async (req: Request, res: Response, next: NextFunction) => {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;

  if (!files) {
    res.status(400).json({
      error: {
        code: "NO_FILES",
        message: "No files provided",
      },
      requestId: req.requestId ?? "-",
    });
    return;
  }

  const errors: Array<{ field: string; filename: string; reason: string }> = [];
  const asyncValidations: Promise<void>[] = [];

  Object.entries(files).forEach(([field, list]) => {
    const allowed = allowedMimeByField[field];

    list.forEach((file) => {
      // Check file size - use different limits for ZIP files
      const isZipFile = file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed';
      const maxSize = isZipFile && field === 'assignments' ? MAX_ZIP_SIZE_BYTES : MAX_FILE_SIZE_BYTES;
      
      if (file.size > maxSize) {
        errors.push({
          field,
          filename: file.originalname,
          reason: `File exceeds maximum size of ${maxSize / 1024 / 1024}MB`,
        });
        return;
      }

      if (allowed && !isAllowedMime(file.mimetype, allowed)) {
        errors.push({
          field,
          filename: file.originalname,
          reason: "File type not allowed",
        });
        return;
      }

      // Additional ZIP validation for assignment uploads
      if (isZipFile && field === 'assignments') {
        const zipValidation = ZipProcessor.validateZipFile(file.buffer)
          .then((validation) => {
            if (!validation.isValid) {
              validation.errors.forEach((error) => {
                errors.push({
                  field,
                  filename: file.originalname,
                  reason: error,
                });
              });
            }
          })
          .catch((error) => {
            errors.push({
              field,
              filename: file.originalname,
              reason: `ZIP validation failed: ${error.message}`,
            });
          });
        
        asyncValidations.push(zipValidation);
      }
    });
  });

  // Wait for async validations to complete
  try {
    await Promise.all(asyncValidations);
  } catch (error) {
    // Async validation errors were already added to errors array
  }

  if (errors.length > 0) {
    res.status(400).json({
      error: {
        code: "INVALID_UPLOAD",
        message: "One or more files are invalid",
        details: errors,
      },
      requestId: req.requestId ?? "-",
    });
    return;
  }

  next();
};
