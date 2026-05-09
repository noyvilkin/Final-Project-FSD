import type { ISkill, IExperience, IEducation, IGapAnalysis } from './professionalDNA.types.js';

// ── JD Ingestion ────────────────────────────────────────────────────

export interface NormalizationMetrics {
  originalLength: number;
  cleanedLength: number;
  reductionPercent: number;
  strippedHtml: boolean;
  strippedBoilerplate: boolean;
}

export interface NormalizedJD {
  cleanText: string;
  originalText: string;
  metrics: NormalizationMetrics;
}

// ── Keyword Extraction ──────────────────────────────────────────────

export type KeywordCategory = 'hard_skill' | 'tool' | 'certification' | 'methodology';

export interface ExtractedKeyword {
  term: string;
  category: KeywordCategory;
  frequency: number;
}

export interface KeywordExtractionResult {
  keywords: ExtractedKeyword[];
  hardSkills: string[];
  tools: string[];
  certifications: string[];
  methodologies: string[];
}

// ── Entity Alignment ────────────────────────────────────────────────

export interface AlignmentResult {
  matchingSkills: string[];
  missingSkills: string[];
  extraSkills: string[];
  relevanceScore: number;
  categoryBreakdown: {
    hardSkills: { matched: string[]; missing: string[] };
    tools: { matched: string[]; missing: string[] };
    certifications: { matched: string[]; missing: string[] };
  };
}

// ── Professional DNA (lightweight view for payload) ─────────────────

export interface ProfessionalDNASummary {
  userId: string;
  skills: ISkill[];
  experience: IExperience[];
  education: IEducation[];
  gapAnalysis?: IGapAnalysis;
  skillNames: string[];
  rawResumeText?: string;
}

// ── AI-Gateway Context Payload ──────────────────────────────────────

export interface ResumeOptimizationPayload {
  normalizedJD: NormalizedJD;
  extractedKeywords: KeywordExtractionResult;
  professionalDNA: ProfessionalDNASummary;
  alignment: AlignmentResult;
  meta: {
    generatedAt: string;
    version: string;
  };
}
