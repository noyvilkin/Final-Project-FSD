import { Types } from "mongoose";
import { createLLMClient } from "../../../common/services/llmClientFactory.js";
import { resolveModelForModule } from "../../../common/services/llmModuleConfig.js";
import type { LLMClient } from "../../../common/services/llmClient.js";
import type { LLMPayload } from "../../../common/types/llmTypes.js";
import { PdfProcessor } from "../../../common/utils/pdfProcessor.js";
import { sanitizeText } from "../../../common/utils/textSanitizer.js";
import { appLogger } from "../../../common/services/logger.js";
import { ProfileAnalysis } from "../models/profileAnalysis.model.js";
import {
  PROFILE_ANALYSIS_SYSTEM_INSTRUCTION,
  buildProfileAnalysisUserMessage,
} from "../prompts/profileAnalysis.prompts.js";

export interface ExtractedProfile {
  candidateName: string | null;
  candidateEmail: string | null;
  profileSummary: {
    hasDegree: boolean;
    highestDegree: string | null;
    fieldOfStudy: string | null;
    institution: string | null;
    gradeAverage: number | null;
    totalYearsOfExperience: number | null;
    lastRoleTitle: string | null;
    lastRoleCompany: string | null;
    topSkills: string[];
    recommendedCourses: string[];
  };
}

/**
 * Owns the full PDF → profile-summary pipeline for the My Profile page:
 * reuses the resume feature's generic PDF text extraction, then runs its
 * own prompt/model/storage independent of ResumeParsingService/ProfessionalDNA.
 */
export class ProfileAnalysisService {
  private static llmClient: LLMClient | null = null;

  private static getClient(modelOverride?: string): LLMClient {
    if (modelOverride) {
      return createLLMClient({
        model: modelOverride,
        temperature: 0.1,
        maxOutputTokens: 2048,
      });
    }

    if (!this.llmClient) {
      this.llmClient = createLLMClient({
        model: resolveModelForModule('profileAnalysis'),
        temperature: 0.1,
        maxOutputTokens: 2048,
      });
    }
    return this.llmClient;
  }

  static async analyzeResume(userId: string, fileBuffer: Buffer) {
    const extraction = await PdfProcessor.extractTextFromPdf(fileBuffer);

    if (!extraction.success || !extraction.extractedText) {
      throw new Error(
        `PDF extraction failed: ${extraction.errors.join('; ') || 'empty document'}`
      );
    }

    const cleanText = sanitizeText(extraction.extractedText);
    const extracted = await this.extractProfileFromText(cleanText);

    const doc = await ProfileAnalysis.create({
      userId: new Types.ObjectId(userId),
      analysisStatus: "completed",
      rawResumeText: cleanText,
      candidateName: extracted.candidateName ?? undefined,
      candidateEmail: extracted.candidateEmail ?? undefined,
      profileSummary: {
        hasDegree: extracted.profileSummary.hasDegree,
        highestDegree: extracted.profileSummary.highestDegree ?? undefined,
        fieldOfStudy: extracted.profileSummary.fieldOfStudy ?? undefined,
        institution: extracted.profileSummary.institution ?? undefined,
        gradeAverage: extracted.profileSummary.gradeAverage ?? undefined,
        totalYearsOfExperience: extracted.profileSummary.totalYearsOfExperience ?? undefined,
        lastRoleTitle: extracted.profileSummary.lastRoleTitle ?? undefined,
        lastRoleCompany: extracted.profileSummary.lastRoleCompany ?? undefined,
        topSkills: extracted.profileSummary.topSkills,
        recommendedCourses: extracted.profileSummary.recommendedCourses,
      },
    });

    return {
      analysisId: doc._id.toString(),
      userId,
      status: "completed" as const,
    };
  }

  /**
   * Database-free profile extraction. Used by the eval harness to test the
   * prompt/parser against a corpus of resume texts without persisting anything,
   * optionally against a specific model and/or a pinned reference date so
   * "Present"/ongoing roles resolve consistently across eval runs.
   */
  static async extractProfileFromText(
    resumeText: string,
    options?: { model?: string; referenceDate?: string }
  ): Promise<ExtractedProfile> {
    const referenceDate = options?.referenceDate ?? new Date().toISOString().slice(0, 10);

    const payload: LLMPayload = {
      system_instruction: {
        parts: [{ text: PROFILE_ANALYSIS_SYSTEM_INSTRUCTION }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: buildProfileAnalysisUserMessage(resumeText, referenceDate) }],
        },
      ],
    };

    const rawResponse = await this.getClient(options?.model).generate(payload);
    return this.parseResponse(rawResponse);
  }

  static async getLatestAnalysis(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      appLogger.warn("[ProfileAnalysis] Invalid userId for analysis lookup", { userId });
      return null;
    }

    const analysis = await ProfileAnalysis.findOne({ userId: new Types.ObjectId(userId) })
      .sort({ updatedAt: -1 })
      .lean();

    if (!analysis) return null;

    return {
      _id: analysis._id,
      userId: analysis.userId,
      candidateName: analysis.candidateName ?? null,
      candidateEmail: analysis.candidateEmail ?? null,
      analysisStatus: analysis.analysisStatus,
      profileSummary: analysis.profileSummary ?? null,
      createdAt: analysis.createdAt,
      updatedAt: analysis.updatedAt,
    };
  }

  private static parseResponse(raw: string): ExtractedProfile {
    try {
      const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "");
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);

      return {
        candidateName: parsed.candidateName ?? null,
        candidateEmail: parsed.candidateEmail ?? null,
        profileSummary: {
          hasDegree: Boolean(parsed.profileSummary?.hasDegree),
          highestDegree: parsed.profileSummary?.highestDegree ?? null,
          fieldOfStudy: parsed.profileSummary?.fieldOfStudy ?? null,
          institution: parsed.profileSummary?.institution ?? null,
          gradeAverage:
            typeof parsed.profileSummary?.gradeAverage === "number"
              ? parsed.profileSummary.gradeAverage
              : null,
          totalYearsOfExperience:
            typeof parsed.profileSummary?.totalYearsOfExperience === "number"
              ? parsed.profileSummary.totalYearsOfExperience
              : null,
          lastRoleTitle: parsed.profileSummary?.lastRoleTitle ?? null,
          lastRoleCompany: parsed.profileSummary?.lastRoleCompany ?? null,
          topSkills: Array.isArray(parsed.profileSummary?.topSkills)
            ? parsed.profileSummary.topSkills
            : [],
          recommendedCourses: Array.isArray(parsed.profileSummary?.recommendedCourses)
            ? parsed.profileSummary.recommendedCourses
            : [],
        },
      };
    } catch (err) {
      appLogger.error("[ProfileAnalysis] Failed to parse LLM response", {
        error: err instanceof Error ? err.message : "Unknown",
        rawPreview: raw.substring(0, 500),
      });
      throw new Error(`Failed to parse profile analysis response: ${(err as Error).message}`);
    }
  }
}
