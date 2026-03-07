import { Router } from "express";
import type { Request, Response } from "express";
import { verifyQStash } from "../../../common/middlewares/verifyQStash.js";
import { asyncHandler } from "../../../common/middlewares/asyncHandler.js";
import { appLogger } from "../../../common/services/logger.js";
import { AssignmentFeedback } from "../models/assignmentFeedback.model.js";
import { AssignmentAnalysisService } from "../services/assignmentAnalysisService.js";
import { AIAnalysisService } from "../services/aiAnalysisService.js";
import { ZipProcessor } from "../../../common/utils/zipProcessor.js";
import { publishEvent } from "../../../common/services/mq.service.js";
import { ResultsService } from "../services/resultsService.js";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  region: process.env.AWS_REGION ?? "us-east-1",
});

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
    const { assignmentId, userId } = req.body as {
      assignmentId?: string;
      userId?: string;
    };

    appLogger.info("[internal] analyze-ai invoked", {
      assignmentId,
      userId,
    });

    if (!assignmentId || !userId) {
      res.status(400).json({ error: "assignmentId and userId are required" });
      return;
    }

    try {
      // Update status to processing AI analysis
      await AssignmentFeedback.findByIdAndUpdate(assignmentId, {
        status: 'processing'
      });

      // Perform AI analysis
      const analysisResult = await AIAnalysisService.analyzeAssignmentWithAI(assignmentId);
      
      // Save analysis results
      await AIAnalysisService.saveAnalysisResults(assignmentId, analysisResult);

      appLogger.info("[internal] AI analysis completed", {
        assignmentId,
        success: analysisResult.success,
        overallScore: analysisResult.feedback?.overall?.score
      });

      // If AI analysis successful, trigger results generation
      if (analysisResult.success) {
        try {
          await ResultsService.triggerResultsGeneration(assignmentId, userId);
          appLogger.info("[internal] Results generation queued", { assignmentId });
        } catch (error) {
          appLogger.warn("[internal] Failed to queue results generation", {
            assignmentId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      res.status(200).json({ 
        status: "completed", 
        assignmentId,
        analysisSuccess: analysisResult.success,
        overallScore: analysisResult.feedback?.overall?.score
      });

    } catch (error) {
      appLogger.error("[internal] AI analysis failed", {
        assignmentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Update status to failed
      await AssignmentFeedback.findByIdAndUpdate(assignmentId, {
        status: 'failed',
        processingErrors: [error instanceof Error ? error.message : 'AI analysis failed']
      }).catch(() => {}); // Ignore DB update errors here

      res.status(500).json({ 
        status: "failed", 
        assignmentId,
        error: "AI analysis processing failed" 
      });
    }
  })
);

router.post(
  "/generate-results",
  asyncHandler(async (req: Request, res: Response) => {
    const { assignmentId, userId } = req.body as {
      assignmentId?: string;
      userId?: string;
    };

    appLogger.info("[internal] generate-results invoked", {
      assignmentId,
      userId,
    });

    if (!assignmentId || !userId) {
      res.status(400).json({ error: "assignmentId and userId are required" });
      return;
    }

    try {
      // Fetch the completed assignment with all analysis data
      const assignment = await AssignmentFeedback.findById(assignmentId);
      
      if (!assignment) {
        res.status(404).json({ error: "Assignment not found" });
        return;
      }

      if (assignment.status !== 'completed' || !assignment.aiFeedback) {
        res.status(400).json({ 
          error: "Assignment analysis not completed or AI feedback missing",
          currentStatus: assignment.status 
        });
        return;
      }

      // Compile final results summary
      const results = {
        assignmentId,
        userId,
        overallGrade: assignment.aiFeedback.overall.grade,
        overallScore: assignment.aiFeedback.overall.score,
        summary: assignment.aiFeedback.overall.summary,
        detailedFeedback: {
          codeQuality: {
            score: assignment.aiFeedback.codeQuality.score,
            strengths: assignment.aiFeedback.codeQuality.strengths,
            improvements: assignment.aiFeedback.codeQuality.weaknesses
          },
          functionalCorrectness: {
            score: assignment.aiFeedback.functionalCorrectness.score,
            meetsRequirements: assignment.aiFeedback.functionalCorrectness.meetsRequirements,
            missingFeatures: assignment.aiFeedback.functionalCorrectness.missingFeatures
          },
          bestPractices: {
            score: assignment.aiFeedback.bestPractices.score,
            followsConventions: assignment.aiFeedback.bestPractices.followsConventions,
            suggestions: assignment.aiFeedback.bestPractices.suggestions
          }
        },
        metadata: {
          language: assignment.metadata?.detectedLanguage,
          frameworks: assignment.metadata?.detectedFrameworks,
          totalFiles: assignment.metadata?.totalFiles,
          totalLines: assignment.metadata?.totalLines,
          analysisCompletedAt: assignment.aiAnalysisCompletedAt,
          createdAt: assignment.createdAt
        }
      };

      appLogger.info("[internal] Results generation completed", {
        assignmentId,
        finalGrade: assignment.aiFeedback.overall.grade,
        finalScore: assignment.aiFeedback.overall.score
      });

      res.status(200).json({ 
        status: "completed", 
        assignmentId,
        results 
      });

    } catch (error) {
      appLogger.error("[internal] Results generation failed", {
        assignmentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({ 
        status: "failed", 
        assignmentId,
        error: "Results generation failed" 
      });
    }
  })
);

router.post(
  "/analyze-assignment",
  asyncHandler(async (req: Request, res: Response) => {
    const { 
      assignmentId, 
      userId, 
      requirementsFileKey, 
      solutionFileKey,
      bucket = process.env.S3_BUCKET_NAME
    } = req.body as {
      assignmentId?: string;
      userId?: string;
      requirementsFileKey?: string;
      solutionFileKey?: string;
      bucket?: string;
    };

    appLogger.info("[internal] analyze-assignment invoked", {
      assignmentId,
      userId,
      requirementsFileKey,
      solutionFileKey
    });

    if (!assignmentId || !userId || !solutionFileKey) {
      res.status(400).json({ 
        error: "assignmentId, userId, and solutionFileKey are required" 
      });
      return;
    }

    try {
      // Update status to scanning
      await AssignmentFeedback.findByIdAndUpdate(assignmentId, {
        status: 'scanning'
      });

      // Download files from S3
      const downloadPromises = [];
      
      // Download solution file (ZIP)
      downloadPromises.push(
        s3Client.send(new GetObjectCommand({ 
          Bucket: bucket, 
          Key: solutionFileKey 
        }))
      );

      // Download requirements file (PDF) if provided
      let requirementsIndex = -1;
      if (requirementsFileKey) {
        requirementsIndex = downloadPromises.length;
        downloadPromises.push(
          s3Client.send(new GetObjectCommand({ 
            Bucket: bucket, 
            Key: requirementsFileKey 
          }))
        );
      }

      const downloadResults = await Promise.all(downloadPromises);
      
      // Convert solution file to buffer
      const solutionResponse = downloadResults[0];
      const solutionBuffer = await streamToBuffer(solutionResponse.Body);
      
      // Convert requirements file to buffer if exists
      let requirementsBuffer: Buffer | undefined;
      if (requirementsIndex >= 0) {
        const requirementsResponse = downloadResults[requirementsIndex];
        requirementsBuffer = await streamToBuffer(requirementsResponse.Body);
      }

      // Process ZIP file
      const zipScanResult = await ZipProcessor.scanZipFile(solutionBuffer);
      
      // Perform comprehensive analysis
      const analysisResult = await AssignmentAnalysisService.analyzeAssignment({
        zipScanResult,
        pdfBuffer: requirementsBuffer
      });

      // Update assignment with results
      const updateData: any = {
        metadata: analysisResult.metadata,
        status: analysisResult.success ? 'processing' : 'failed'
      };

      if (analysisResult.errors.length > 0) {
        updateData.processingErrors = analysisResult.errors;
      }

      await AssignmentFeedback.findByIdAndUpdate(assignmentId, updateData);

      appLogger.info("[internal] Assignment analysis completed", {
        assignmentId,
        success: analysisResult.success,
        detectedLanguage: analysisResult.metadata.detectedLanguage,
        errorsCount: analysisResult.errors.length
      });

      // If analysis successful, trigger AI analysis
      if (analysisResult.success) {
        appLogger.info("[internal] Assignment ready for AI analysis", { assignmentId });
        
        try {
          // Trigger AI analysis via QStash
          await publishEvent("analysis-requested", { 
            assignmentId, 
            userId 
          });
          
          appLogger.info("[internal] AI analysis queued successfully", { assignmentId });
        } catch (queueError) {
          appLogger.error("[internal] Failed to queue AI analysis", {
            assignmentId,
            error: queueError instanceof Error ? queueError.message : 'Unknown queue error'
          });
          // Don't fail the whole request if queuing fails
        }
      }

      res.status(200).json({ 
        status: "accepted", 
        assignmentId,
        analysisSuccess: analysisResult.success 
      });

    } catch (error) {
      appLogger.error("[internal] Assignment analysis failed", {
        assignmentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Update status to failed
      await AssignmentFeedback.findByIdAndUpdate(assignmentId, {
        status: 'failed',
        processingErrors: [error instanceof Error ? error.message : 'Analysis failed']
      }).catch(() => {}); // Ignore DB update errors here

      res.status(500).json({ 
        status: "failed", 
        assignmentId,
        error: "Analysis processing failed" 
      });
    }
  })
);

/**
 * Helper function to convert stream to buffer
 */
async function streamToBuffer(stream: any): Promise<Buffer> {
  if (!stream) {
    throw new Error('Stream is undefined');
  }
  
  const chunks: Uint8Array[] = [];
  
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  
  return Buffer.concat(chunks);
}

export default router;
