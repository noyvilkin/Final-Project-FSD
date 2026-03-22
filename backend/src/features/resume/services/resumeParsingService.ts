import { Types } from 'mongoose';
import { GeminiClient } from '../../../common/services/geminiClient.js';
import type { GeminiPayload } from '../../../common/types/geminiTypes.js';
import { PdfProcessor } from '../../../common/utils/pdfProcessor.js';
import { sanitizeText } from '../../../common/utils/textSanitizer.js';
import { appLogger } from '../../../common/services/logger.js';
import { User } from '../../user/models/user.model.js';
import { ProfessionalDNA } from '../models/professionalDNA.model.js';
import {
  DNA_EXTRACTION_SYSTEM_INSTRUCTION,
  buildDnaExtractionUserMessage,
} from '../prompts/dnaExtractionPrompts.js';

const MODEL_NAME = 'gemini-2.5-flash';

interface ParsedDNA {
  candidateName: string | null;
  candidateEmail: string | null;
  skills: Array<{
    name: string;
    category: 'technical' | 'soft' | 'tool' | 'language';
    proficiencyLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
    yearsOfExperience?: number;
  }>;
  experience: Array<{
    company: string;
    role: string;
    startDate: string;
    endDate?: string;
    isCurrent: boolean;
    description: string;
    extractedSkills: string[];
  }>;
  education: Array<{
    institution: string;
    degree: string;
    fieldOfStudy: string;
    startDate: string;
    endDate?: string;
    gpa?: number;
  }>;
}

export class ResumeParsingService {
  private static geminiClient: GeminiClient | null = null;

  private static getClient(): GeminiClient {
    if (!this.geminiClient) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is required');
      this.geminiClient = new GeminiClient({
        apiKey,
        model: MODEL_NAME,
        temperature: 0.1,
        maxOutputTokens: 8192,
        rateLimiter: { requestsPerMinute: 8, requestsPerDay: 1200 },
      });
    }
    return this.geminiClient;
  }

  /**
   * Full pipeline: PDF buffer → text extraction → Gemini parsing →
   * User upsert → ProfessionalDNA creation → returns userId + dnaId.
   */
  static async parseAndStore(
    pdfBuffer: Buffer,
    existingUserId?: string
  ): Promise<{
    userId: string;
    dnaId: string;
    candidateName: string | null;
    candidateEmail: string | null;
    skillCount: number;
    experienceCount: number;
  }> {
    const extraction = await PdfProcessor.extractTextFromPdf(pdfBuffer);

    if (!extraction.success || !extraction.extractedText) {
      throw new Error(
        `PDF extraction failed: ${extraction.errors.join('; ') || 'empty document'}`
      );
    }

    const cleanText = sanitizeText(extraction.extractedText);

    appLogger.info('[ResumeParser] PDF text extracted & sanitized', {
      pages: extraction.metadata.totalPages,
      rawChars: extraction.extractedText.length,
      cleanChars: cleanText.length,
    });

    const parsed = await this.callGeminiForDNA(cleanText);

    appLogger.info('[ResumeParser] Gemini DNA extraction complete', {
      skills: parsed.skills.length,
      experience: parsed.experience.length,
      education: parsed.education.length,
      candidate: parsed.candidateName,
    });

    const userId = await this.upsertUser(parsed, existingUserId);

    const dna = await ProfessionalDNA.create({
      userId: new Types.ObjectId(userId),
      analysisStatus: 'completed',
      rawResumeText: cleanText,
      skills: parsed.skills,
      experience: parsed.experience.map((exp) => ({
        ...exp,
        startDate: new Date(exp.startDate),
        endDate: exp.endDate ? new Date(exp.endDate) : undefined,
      })),
      education: parsed.education.map((edu) => ({
        ...edu,
        startDate: new Date(edu.startDate),
        endDate: edu.endDate ? new Date(edu.endDate) : undefined,
      })),
    });

    await User.findByIdAndUpdate(userId, { latestProfessionalDNA: dna._id });

    appLogger.info('[ResumeParser] DNA stored', { userId, dnaId: dna._id.toString() });

    return {
      userId,
      dnaId: dna._id.toString(),
      candidateName: parsed.candidateName,
      candidateEmail: parsed.candidateEmail,
      skillCount: parsed.skills.length,
      experienceCount: parsed.experience.length,
    };
  }

  // ── Gemini call ─────────────────────────────────────────────────

  private static async callGeminiForDNA(resumeText: string): Promise<ParsedDNA> {
    const userMessage = buildDnaExtractionUserMessage(resumeText);

    const payload: GeminiPayload = {
      system_instruction: { parts: [{ text: DNA_EXTRACTION_SYSTEM_INSTRUCTION }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    };

    const client = this.getClient();
    const rawResponse = await client.generate(payload);

    return this.parseResponse(rawResponse);
  }

  private static parseResponse(raw: string): ParsedDNA {
    try {
      const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      const jsonText = jsonMatch ? jsonMatch[0] : cleaned;
      const parsed = JSON.parse(jsonText);

      if (!Array.isArray(parsed.skills)) {
        throw new Error('Missing skills array');
      }

      return {
        candidateName: parsed.candidateName ?? null,
        candidateEmail: parsed.candidateEmail ?? null,
        skills: parsed.skills.map((s: Record<string, unknown>) => ({
          name: String(s.name ?? ''),
          category: (['technical', 'soft', 'tool', 'language'].includes(String(s.category))
            ? s.category
            : 'technical') as 'technical' | 'soft' | 'tool' | 'language',
          proficiencyLevel: (['beginner', 'intermediate', 'advanced', 'expert'].includes(
            String(s.proficiencyLevel)
          )
            ? s.proficiencyLevel
            : 'intermediate') as 'beginner' | 'intermediate' | 'advanced' | 'expert',
          yearsOfExperience: s.yearsOfExperience != null ? Number(s.yearsOfExperience) : undefined,
        })),
        experience: (parsed.experience ?? []).map((e: Record<string, unknown>) => ({
          company: String(e.company ?? 'Unknown'),
          role: String(e.role ?? 'Unknown'),
          startDate: String(e.startDate ?? '2020-01-01'),
          endDate: e.endDate ? String(e.endDate) : undefined,
          isCurrent: Boolean(e.isCurrent),
          description: String(e.description ?? ''),
          extractedSkills: Array.isArray(e.extractedSkills) ? e.extractedSkills.map(String) : [],
        })),
        education: (parsed.education ?? []).map((ed: Record<string, unknown>) => ({
          institution: String(ed.institution ?? 'Unknown'),
          degree: String(ed.degree ?? 'Unknown'),
          fieldOfStudy: String(ed.fieldOfStudy ?? 'General'),
          startDate: String(ed.startDate ?? '2015-01-01'),
          endDate: ed.endDate ? String(ed.endDate) : undefined,
          gpa: ed.gpa != null ? Number(ed.gpa) : undefined,
        })),
      };
    } catch (err) {
      appLogger.error('[ResumeParser] Failed to parse Gemini response', {
        error: err instanceof Error ? err.message : 'Unknown',
        rawPreview: raw.substring(0, 500),
      });
      throw new Error(`Failed to parse resume extraction response: ${(err as Error).message}`);
    }
  }

  // ── User upsert ─────────────────────────────────────────────────

  private static async upsertUser(
    parsed: ParsedDNA,
    existingUserId?: string
  ): Promise<string> {
    if (existingUserId && Types.ObjectId.isValid(existingUserId)) {
      const existing = await User.findById(existingUserId);
      if (existing) return existing._id.toString();
    }

    if (parsed.candidateEmail) {
      const byEmail = await User.findOne({ email: parsed.candidateEmail.toLowerCase() });
      if (byEmail) return byEmail._id.toString();
    }

    const nameParts = (parsed.candidateName ?? '').split(/\s+/);
    const firstName = nameParts[0] || 'User';
    const lastName = nameParts.slice(1).join(' ') || '';

    const user = await User.create({
      email: parsed.candidateEmail || `user-${Date.now()}@careerpilot.local`,
      passwordHash: '$2b$10$placeholder_uploaded_resume',
      profile: { firstName, lastName },
      isActive: true,
    });

    return user._id.toString();
  }
}
