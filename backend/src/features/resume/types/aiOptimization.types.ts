// ── Gemini Raw Response Shapes ───────────────────────────────────────

export interface GeminiOptimizedBullet {
  // Index of the experience entry this bullet belongs to. Multiple
  // optimized bullets can share the same experienceIndex.
  experienceIndex: number;
  originalBullet: string;
  optimizedBullet: string;
  explanation: string;
  confidenceScore: number;
  keywordsUsed: string[];
}

export interface GeminiOptimizationResponse {
  optimizedBullets: GeminiOptimizedBullet[];
  generalAdvice: string;
}

export interface GeminiSemanticScoreResponse {
  semanticScore: number;
  reasoning: string;
  strongMatches: string[];
  weakMatches: string[];
}

// ── Hybrid Score ────────────────────────────────────────────────────

export interface HybridScoreBreakdown {
  hardRuleScore: number;
  hardRuleWeight: number;
  semanticScore: number;
  semanticWeight: number;
  finalScore: number;
  hardRuleDetails: {
    totalRequired: number;
    totalMatched: number;
    matchedSkills: string[];
    missingSkills: string[];
  };
  semanticDetails: {
    score: number;
    reasoning: string;
    strongMatches: string[];
    weakMatches: string[];
  };
}

// ── Adapted UI-Ready Types (Adapter Pattern output) ─────────────────

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface OptimizedBulletUI {
  id: string;
  // Index of the experience entry this bullet belongs to (used to map
  // accepted rewrites back to the right job at download time).
  index: number;
  company: string;
  role: string;
  originalBullet: string;
  optimizedBullet: string;
  explanation: string;
  confidenceScore: number;
  confidenceLevel: ConfidenceLevel;
  keywordsUsed: string[];
  status: 'pending' | 'accepted' | 'discarded' | 'edited';
  userEdit?: string;
}

export interface OptimizationDashboardData {
  bullets: OptimizedBulletUI[];
  generalAdvice: string;
  hybridScore: HybridScoreBreakdown;
  gapsRemaining: string[];
  meta: {
    generatedAt: string;
    promptVersion: string;
    modelUsed: string;
  };
}

// ── API Request / Response ──────────────────────────────────────────

export interface OptimizationRequest {
  userId: string;
  jobDescriptionText?: string;
  jobDescriptionPdf?: Buffer;
}

export interface OptimizationAPIResponse {
  success: boolean;
  data?: OptimizationDashboardData;
  error?: string;
}
