import { randomUUID } from 'crypto';
import type {
  GeminiOptimizationResponse,
  GeminiOptimizedBullet,
  BulletToOptimize,
  OptimizedBulletUI,
  ConfidenceLevel,
} from '../types/optimization.types.js';

/**
 * Adapter Pattern: transforms raw Gemini LLM responses
 * into the shape expected by the frontend UI state.
 */
export class GeminiResponseAdapter {
  static toUIState(
    response: GeminiOptimizationResponse,
    originalBullets: BulletToOptimize[],
  ): OptimizedBulletUI[] {
    const bulletMap = new Map(
      originalBullets.map(b => [b.experienceIndex, b]),
    );

    return response.optimizedBullets.map(gemini =>
      this.adaptBullet(gemini, bulletMap.get(gemini.experienceIndex)),
    );
  }

  private static adaptBullet(
    gemini: GeminiOptimizedBullet,
    original?: BulletToOptimize,
  ): OptimizedBulletUI {
    return {
      id: randomUUID(),
      experienceIndex: gemini.experienceIndex,
      role: original?.role ?? 'Unknown Role',
      company: original?.company ?? 'Unknown Company',
      originalBullet: gemini.originalBullet,
      optimizedBullet: gemini.optimizedBullet,
      editedBullet: gemini.optimizedBullet,
      explanation: gemini.explanation,
      confidenceScore: gemini.confidenceScore,
      confidenceLevel: this.deriveConfidenceLevel(gemini.confidenceScore),
      keywordsUsed: gemini.keywordsUsed,
      status: 'pending',
    };
  }

  private static deriveConfidenceLevel(score: number): ConfidenceLevel {
    if (score >= 0.7) return 'high';
    if (score >= 0.5) return 'medium';
    return 'low';
  }
}
