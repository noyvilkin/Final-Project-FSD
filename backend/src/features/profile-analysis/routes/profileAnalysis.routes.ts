import express from "express";
import multer from "multer";
import { ProfileAnalysisService } from "../services/profileAnalysis.service.js";

const router = express.Router();
const upload = multer();

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const userId = req.body.userId;

    if (!userId) {
      return res.status(400).json({ message: "Missing userId" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const result = await ProfileAnalysisService.analyzeResume(
      userId,
      req.file.buffer
    );

    return res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get("/:userId", async (req, res) => {
  try {
    const data = await ProfileAnalysisService.getLatestAnalysis(
      req.params.userId
    );

    return res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;