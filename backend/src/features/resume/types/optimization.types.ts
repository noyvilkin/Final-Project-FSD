import type { ISkill, IExperience } from './professionalDNA.types.js';

// ── Job Description (parsed input) ──────────────────────────────────

export interface JobDescriptionInput {
  title: string;
  company?: string;
  description: string;
  requiredSkills: string[];
  preferredSkills?: string[];
  coreResponsibilities: string[];
}

// ── Optimization Payload (sent to Gemini) ───────────────────────────

export interface BulletToOptimize {
  experienceIndex: number;
  originalBullet: string;
  role: string;
  company: string;
}

export interface OptimizationPayload {
  professionalDNAId: string;
  jobDescription: JobDescriptionInput;
  bulletsToOptimize: BulletToOptimize[];
  skills: ISkill[];
  experience: IExperience[];
}

// ── Gemini Response (raw LLM output) ────────────────────────────────

export interface GeminiOptimizedBullet {
  experienceIndex: number;
  originalBullet: string;
  optimizedBullet: string;
  explanation: string;
  confidenceScore: number;
  keywordsUsed: string[];
}

export interface GeminiOptimizationResponse {
  optimizedBullets: GeminiOptimizedBullet[];
  overallNotes: string;
}

// ── Adapted UI State (after Adapter Pattern) ────────────────────────

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface OptimizedBulletUI {
  id: string;
  experienceIndex: number;
  role: string;
  company: string;
  originalBullet: string;
  optimizedBullet: string;
  editedBullet: string;
  explanation: string;
  confidenceScore: number;
  confidenceLevel: ConfidenceLevel;
  keywordsUsed: string[];
  status: 'pending' | 'accepted' | 'discarded';
}

// ── Hybrid Scoring ──────────────────────────────────────────────────

export interface HardRuleMatchResult {
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  totalRequired: number;
}

export interface SemanticSimilarityResult {
  score: number;
  topMatchingAreas: string[];
  weakAreas: string[];
}

export interface HybridScoreResult {
  finalScore: number;
  hardRuleMatch: HardRuleMatchResult;
  semanticSimilarity: SemanticSimilarityResult;
  gapsRemaining: string[];
}

// ── API Request / Response ──────────────────────────────────────────

export interface OptimizeRequest {
  professionalDNAId: string;
  jobDescription: JobDescriptionInput;
  selectedBulletIndices?: number[];
}

export interface OptimizeResponse {
  bullets: OptimizedBulletUI[];
  hybridScore: HybridScoreResult;
}

export interface AcceptBulletRequest {
  professionalDNAId: string;
  experienceIndex: number;
  finalBullet: string;
}
