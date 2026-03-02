import type { Request, Response, NextFunction } from "express";

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

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

export const validateUploads = (req: Request, res: Response, next: NextFunction) => {
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

  Object.entries(files).forEach(([field, list]) => {
    const allowed = allowedMimeByField[field];

    list.forEach((file) => {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        errors.push({
          field,
          filename: file.originalname,
          reason: "File exceeds maximum size",
        });
        return;
      }

      if (allowed && !isAllowedMime(file.mimetype, allowed)) {
        errors.push({
          field,
          filename: file.originalname,
          reason: "File type not allowed",
        });
      }
    });
  });

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
