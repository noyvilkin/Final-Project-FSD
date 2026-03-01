import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { validateUploads } from "../middlewares/validateUploads.js";
import { uploadFileToS3 } from "../services/s3Upload.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
    files: 10,
  },
});

const router = Router();

router.post(
  "/",
  upload.fields([
    { name: "documents", maxCount: 5 },
    { name: "assignments", maxCount: 5 },
    { name: "media", maxCount: 5 },
  ]),
  validateUploads,
  asyncHandler(async (req, res) => {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const documents = files?.documents ?? [];
    const assignments = files?.assignments ?? [];
    const media = files?.media ?? [];
    const uploads = [...documents, ...assignments, ...media];

    if (uploads.length === 0) {
      res.status(400).json({ message: "No files provided" });
      return;
    }

    const bucket = process.env.S3_BUCKET;
    const region = process.env.AWS_REGION;

    if (!bucket || !region) {
      res.status(500).json({ message: "S3 not configured" });
      return;
    }

    const results = await Promise.all(
      uploads.map((file) => uploadFileToS3({
        bucket,
        file,
        requestId: req.requestId,
      }))
    );

    res.status(201).json({
      count: results.length,
      files: results,
    });
  })
);

export default router;
