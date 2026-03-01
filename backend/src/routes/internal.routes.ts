import { Router } from "express";
import type { Request, Response } from "express";
import { verifyQStash } from "../middlewares/verifyQStash.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { appLogger } from "../services/logger.js";

const router = Router();

router.use(verifyQStash);

router.post(
  "/extract-text",
  asyncHandler(async (req: Request, res: Response) => {
    const { fileKey, bucket, userId, mimeType } = req.body as {
      fileKey?: string;
      bucket?: string;
      userId?: string;
      mimeType?: string;
    };

    appLogger.info("[internal] extract-text invoked", {
      fileKey,
      bucket,
      userId,
      mimeType,
    });

    if (!fileKey || !userId) {
      res.status(400).json({ error: "fileKey and userId are required" });
      return;
    }

    // TODO: download from S3, parse PDF/DOCX, store extracted text
    appLogger.info("[internal] Text extraction started", { fileKey, userId });

    res.status(200).json({ status: "accepted", fileKey });
  })
);

router.post(
  "/analyze-ai",
  asyncHandler(async (req: Request, res: Response) => {
    const { documentId, userId, analysisType } = req.body as {
      documentId?: string;
      userId?: string;
      analysisType?: string;
    };

    appLogger.info("[internal] analyze-ai invoked", {
      documentId,
      userId,
      analysisType,
    });

    if (!documentId || !userId) {
      res.status(400).json({ error: "documentId and userId are required" });
      return;
    }

    // TODO: call OpenAI / Gemini API, persist results
    appLogger.info("[internal] AI analysis started", {
      documentId,
      userId,
      analysisType,
    });

    res.status(200).json({ status: "accepted", documentId });
  })
);

router.post(
  "/generate-results",
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, analysisId, resultType } = req.body as {
      userId?: string;
      analysisId?: string;
      resultType?: string;
    };

    appLogger.info("[internal] generate-results invoked", {
      userId,
      analysisId,
      resultType,
    });

    if (!userId || !analysisId) {
      res.status(400).json({ error: "userId and analysisId are required" });
      return;
    }

    // TODO: compile final results, store in DB, notify user
    appLogger.info("[internal] Results generation started", {
      userId,
      analysisId,
      resultType,
    });

    res.status(200).json({ status: "accepted", analysisId });
  })
);

export default router;
