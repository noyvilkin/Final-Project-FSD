import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { validateUploads } from "../middlewares/validateUploads.js";
import { uploadFileToS3 } from "../services/s3Upload.js";
import type { StoragePath } from "../services/s3Upload.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
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

    const uploadTasks: ReturnType<typeof uploadFileToS3>[] = [];

    for (const [field, list] of Object.entries(files ?? {})) {
      const path = FIELD_TO_PATH[field];
      if (!path) continue;

      for (const file of list) {
        uploadTasks.push(uploadFileToS3({ file, path }));
      }
    }

    if (uploadTasks.length === 0) {
      res.status(400).json({ message: "No files provided" });
      return;
    }

    const results = await Promise.all(uploadTasks);

    res.status(201).json({
      count: results.length,
      files: results,
    });
  })
);

export default router;
