import { ProfileAnalysis } from "../models/profileAnalysis.model.js";
import { appLogger } from "../../../common/services/logger.js";
import { GeminiClient } from "../../../common/services/geminiClient.js";
import { PdfProcessor } from "../../../common/utils/pdfProcessor.js";
import {
  PROFILE_ANALYSIS_SYSTEM_INSTRUCTION,
  buildProfileAnalysisUserMessage,
} from "../prompts/profileAnalysis.prompts.js";

export class ProfileAnalysisService {
  static async analyzeResume(userId: string, fileBuffer: Buffer) {
    try {
      const extraction = await PdfProcessor.extractTextFromPdf(fileBuffer);

      if (!extraction.success || !extraction.normalizedText.trim()) {
        throw new Error(
          extraction.errors[0] || "Failed to extract text from PDF"
        );
      }

      const rawText = extraction.normalizedText;

      const analysis = await ProfileAnalysis.create({
        userId,
        rawResumeText: rawText,
        analysisStatus: "processing",
      });

      const userMessage = buildProfileAnalysisUserMessage(rawText);

      const geminiClient = new GeminiClient({
        apiKey: process.env.GEMINI_API_KEY!,
      });

      const rawResponse = await geminiClient.generate({
        systemInstruction: {
          parts: [{ text: PROFILE_ANALYSIS_SYSTEM_INSTRUCTION }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: userMessage }],
          },
        ],
      });

      const geminiResponse = JSON.parse(rawResponse);

      await ProfileAnalysis.findByIdAndUpdate(analysis._id, {
        candidateName: geminiResponse.candidateName,
        candidateEmail: geminiResponse.candidateEmail,
        profileSummary: geminiResponse.profileSummary,
        analysisStatus: "completed",
      });

      return {
        analysisId: analysis._id,
        status: "completed",
      };
    } catch (error: any) {
      appLogger.error("Profile analysis failed", { error });

      throw error;
    }
  }

  static async getLatestAnalysis(userId: string) {
    return ProfileAnalysis.findOne({ userId })
      .sort({ updatedAt: -1 })
      .lean();
  }
}