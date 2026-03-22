import { Types } from 'mongoose';
import { ProfessionalDNA, type IProfessionalDNA } from '../models/professionalDNA.model.js';
import { User } from '../../user/models/user.model.js';
import { appLogger } from '../../../common/services/logger.js';

import { JdIngestionService } from './jdIngestionService.js';
import { KeywordExtractor } from './keywordExtractor.js';
import { EntityAlignmentService } from './entityAlignmentService.js';

import type {
  NormalizedJD,
  KeywordExtractionResult,
  AlignmentResult,
  ProfessionalDNASummary,
  ResumeOptimizationPayload,
} from '../types/resumeOptimization.types.js';

const PAYLOAD_VERSION = '1.0.0';

/**
 * Facade that orchestrates the full resume-optimization pipeline:
 *
 *   1. Ingest & normalize the JD  (text or PDF)
 *   2. Extract ATS-relevant keywords
 *   3. Load the user's Professional DNA
 *   4. Align JD requirements against the user's skills
 *   5. Package everything into a single AI-gateway-ready payload
 */
export class ResumeOptimizationService {

  // ── High-level orchestrators ────────────────────────────────────

  static async prepareFromText(
    userId: string,
    rawJdText: string
  ): Promise<ResumeOptimizationPayload> {
    const normalizedJD = JdIngestionService.fromText(rawJdText);
    return this.buildPayload(userId, normalizedJD);
  }

  static async prepareFromPdf(
    userId: string,
    pdfBuffer: Buffer
  ): Promise<ResumeOptimizationPayload> {
    const normalizedJD = await JdIngestionService.fromPdf(pdfBuffer);
    return this.buildPayload(userId, normalizedJD);
  }

  // ── Individual pipeline stages (exposed for unit testing) ──────

  static extractKeywords(cleanText: string): KeywordExtractionResult {
    return KeywordExtractor.extract(cleanText);
  }

  static computeAlignment(
    keywords: KeywordExtractionResult,
    dna: ProfessionalDNASummary
  ): AlignmentResult {
    return EntityAlignmentService.align(keywords, dna.skills);
  }

  // ── Core pipeline ───────────────────────────────────────────────

  private static async buildPayload(
    userId: string,
    normalizedJD: NormalizedJD
  ): Promise<ResumeOptimizationPayload> {
    const keywords = this.extractKeywords(normalizedJD.cleanText);

    appLogger.info('JD keyword extraction complete', {
      userId,
      totalKeywords:   keywords.keywords.length,
      hardSkillsCount: keywords.hardSkills.length,
      toolsCount:      keywords.tools.length,
      certsCount:      keywords.certifications.length,
    });

    const dna = await this.loadProfessionalDNA(userId);
    const alignment = this.computeAlignment(keywords, dna);

    appLogger.info('Entity alignment complete', {
      userId,
      relevanceScore: alignment.relevanceScore,
      matchCount:     alignment.matchingSkills.length,
      missingCount:   alignment.missingSkills.length,
    });

    return {
      normalizedJD,
      extractedKeywords: keywords,
      professionalDNA:   dna,
      alignment,
      meta: {
        generatedAt: new Date().toISOString(),
        version:     PAYLOAD_VERSION,
      },
    };
  }

  // ── Data access ─────────────────────────────────────────────────

  private static async loadProfessionalDNA(
    userId: string
  ): Promise<ProfessionalDNASummary> {
    let dnaDoc: IProfessionalDNA | null = null;

    if (Types.ObjectId.isValid(userId)) {
      const user = await User.findById(userId).lean();
      if (user?.latestProfessionalDNA) {
        dnaDoc = await ProfessionalDNA.findById(user.latestProfessionalDNA).lean();
      }

      if (!dnaDoc) {
        dnaDoc = await ProfessionalDNA.findOne({ userId: new Types.ObjectId(userId) })
          .sort({ updatedAt: -1 })
          .lean();
      }
    }

    if (!dnaDoc) {
      appLogger.warn('No Professional DNA found for user — alignment will run against empty profile', { userId });
      return {
        userId,
        skills:     [],
        experience: [],
        education:  [],
        skillNames: [],
      };
    }

    return {
      userId,
      skills:     dnaDoc.skills,
      experience: dnaDoc.experience,
      education:  dnaDoc.education,
      gapAnalysis: dnaDoc.gapAnalysis,
      skillNames: dnaDoc.skills.map(s => s.name),
    };
  }
}
