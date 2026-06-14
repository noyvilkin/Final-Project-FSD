import { Types } from "mongoose";
import { appLogger } from "../../../common/services/logger.js";
import { ProfessionalDNA } from "../../resume/models/professionalDNA.model.js";
import { ResumeParsingService } from "../../resume/services/resumeParsingService.js";
import { User } from "../../user/models/user.model.js";

/**
 * Thin facade kept for backwards compatibility with the My Profile page.
 *
 * Resume analysis and CV optimization now share a single parse pipeline
 * (ResumeParsingService → ProfessionalDNA). This service:
 *   - delegates uploads to that pipeline, and
 *   - projects the stored DNA into the dashboard-friendly shape the
 *     My Profile page already expects.
 */
export class ProfileAnalysisService {
  static async analyzeResume(userId: string, fileBuffer: Buffer) {
    const result = await ResumeParsingService.parseAndStore(fileBuffer, userId);

    return {
      analysisId: result.dnaId,
      userId: result.userId,
      status: "completed" as const,
    };
  }

  static async getLatestAnalysis(userId: string) {
    if (!userId) return null;

    const dna = await this.loadLatestDNA(userId);
    if (!dna) return null;

    return {
      _id: dna._id,
      userId: dna.userId,
      candidateName: dna.candidateName ?? null,
      candidateEmail: dna.candidateEmail ?? null,
      analysisStatus: dna.analysisStatus,
      profileSummary: dna.profileSummary ?? null,
      createdAt: dna.createdAt,
      updatedAt: dna.updatedAt,
    };
  }

  private static async loadLatestDNA(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      appLogger.warn("[ProfileAnalysis] Invalid userId for DNA lookup", { userId });
      return null;
    }

    const user = await User.findById(userId).lean();
    if (user?.latestProfessionalDNA) {
      const stamped = await ProfessionalDNA.findById(user.latestProfessionalDNA).lean();
      if (stamped) return stamped;
    }

    return ProfessionalDNA.findOne({ userId: new Types.ObjectId(userId) })
      .sort({ updatedAt: -1 })
      .lean();
  }
}
