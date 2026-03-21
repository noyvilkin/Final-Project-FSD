import type { ISkill } from '../types/professionalDNA.types.js';
import type {
  AlignmentResult,
  KeywordExtractionResult,
} from '../types/resumeOptimization.types.js';

/**
 * Compares extracted JD keywords against the user's Professional DNA
 * to produce a structured Match Report with a 0-100 relevance score.
 */
export class EntityAlignmentService {

  // ── Public API ──────────────────────────────────────────────────

  static align(
    jdKeywords: KeywordExtractionResult,
    userSkills: ISkill[]
  ): AlignmentResult {
    const userIndex = this.buildSkillIndex(userSkills);

    const hardSkillResult = this.matchCategory(jdKeywords.hardSkills, userIndex);
    const toolResult      = this.matchCategory(jdKeywords.tools,      userIndex);
    const certResult      = this.matchCategory(jdKeywords.certifications, userIndex);
    const methResult      = this.matchCategory(jdKeywords.methodologies, userIndex);

    const allMatching = [
      ...hardSkillResult.matched,
      ...toolResult.matched,
      ...certResult.matched,
      ...methResult.matched,
    ];

    const allMissing = [
      ...hardSkillResult.missing,
      ...toolResult.missing,
      ...certResult.missing,
      ...methResult.missing,
    ];

    const extraSkills = this.findExtraSkills(userIndex, jdKeywords);
    const relevanceScore = this.computeRelevanceScore(jdKeywords, allMatching);

    return {
      matchingSkills: this.dedup(allMatching),
      missingSkills:  this.dedup(allMissing),
      extraSkills:    this.dedup(extraSkills),
      relevanceScore,
      categoryBreakdown: {
        hardSkills:     hardSkillResult,
        tools:          toolResult,
        certifications: certResult,
      },
    };
  }

  // ── Matching engine ─────────────────────────────────────────────

  private static matchCategory(
    requiredTerms: string[],
    userIndex: Map<string, ISkill>
  ): { matched: string[]; missing: string[] } {
    const matched: string[] = [];
    const missing: string[] = [];

    for (const term of requiredTerms) {
      if (this.hasMatch(term, userIndex)) {
        matched.push(term);
      } else {
        missing.push(term);
      }
    }

    return { matched, missing };
  }

  /**
   * Fuzzy-ish match: normalizes both sides and also checks common
   * synonyms (e.g. "Node.js" ↔ "NodeJS", "React.js" ↔ "ReactJS").
   */
  private static hasMatch(term: string, index: Map<string, ISkill>): boolean {
    const normalizedTerm = this.normalizeKey(term);
    if (index.has(normalizedTerm)) return true;

    for (const variant of this.synonyms(normalizedTerm)) {
      if (index.has(variant)) return true;
    }

    for (const key of index.keys()) {
      if (key.includes(normalizedTerm) || normalizedTerm.includes(key)) {
        return true;
      }
    }

    return false;
  }

  // ── Skill index ─────────────────────────────────────────────────

  private static buildSkillIndex(skills: ISkill[]): Map<string, ISkill> {
    const map = new Map<string, ISkill>();
    for (const skill of skills) {
      map.set(this.normalizeKey(skill.name), skill);
    }
    return map;
  }

  private static normalizeKey(term: string): string {
    return term
      .toLowerCase()
      .replace(/[.\-/\\+#]/g, '')
      .replace(/\s+/g, '')
      .trim();
  }

  // ── Synonyms ────────────────────────────────────────────────────

  private static readonly SYNONYM_MAP: Record<string, string[]> = {
    nodejs:       ['node', 'nodej'],
    reactjs:      ['react'],
    vuejs:        ['vue'],
    nextjs:       ['next'],
    expressjs:    ['express'],
    typescript:   ['ts'],
    javascript:   ['js'],
    postgresql:   ['postgres'],
    mongodb:      ['mongo'],
    kubernetes:   ['k8s'],
    amazonaws:    ['aws'],
    googlecloud:  ['gcp'],
    microsoftazure: ['azure'],
    cicd:         ['ci', 'cd', 'continuousintegration', 'continuousdelivery'],
    restapi:      ['rest', 'restful'],
    machinelearning: ['ml'],
    deeplearning: ['dl'],
    naturallanguageprocessing: ['nlp'],
    testdrivendevelopment: ['tdd'],
    domaindrivendesign:   ['ddd'],
    objectoriented:       ['oop'],
    sitereliabilityengineering: ['sre'],
  };

  private static synonyms(normalized: string): string[] {
    const direct = this.SYNONYM_MAP[normalized];
    if (direct) return direct;

    for (const [canonical, aliases] of Object.entries(this.SYNONYM_MAP)) {
      if (aliases.includes(normalized)) return [canonical];
    }
    return [];
  }

  // ── Extra skills (user has but JD doesn't ask for) ──────────────

  private static findExtraSkills(
    userIndex: Map<string, ISkill>,
    jdKeywords: KeywordExtractionResult
  ): string[] {
    const allRequired = new Set(
      [...jdKeywords.hardSkills, ...jdKeywords.tools, ...jdKeywords.certifications, ...jdKeywords.methodologies]
        .map(t => this.normalizeKey(t))
    );

    const extras: string[] = [];
    for (const [key, skill] of userIndex) {
      const isRequired = allRequired.has(key) ||
        [...allRequired].some(r => r.includes(key) || key.includes(r));
      if (!isRequired) {
        extras.push(skill.name);
      }
    }
    return extras;
  }

  // ── Relevance score ─────────────────────────────────────────────

  /**
   * Weighted relevance score (0-100):
   *   hard_skills = 50 %, tools = 25 %, certifications = 15 %, methodologies = 10 %
   */
  private static computeRelevanceScore(
    jdKeywords: KeywordExtractionResult,
    allMatching: string[]
  ): number {
    const weights = {
      hard_skill:     0.50,
      tool:           0.25,
      certification:  0.15,
      methodology:    0.10,
    } as const;

    const matchedSet = new Set(allMatching.map(t => this.normalizeKey(t)));
    let weightedSum   = 0;
    let weightedTotal = 0;

    for (const kw of jdKeywords.keywords) {
      const w = weights[kw.category] ?? 0.10;
      weightedTotal += w;
      if (matchedSet.has(this.normalizeKey(kw.term))) {
        weightedSum += w;
      }
    }

    if (weightedTotal === 0) return 0;
    return Math.round((weightedSum / weightedTotal) * 100);
  }

  // ── Utilities ───────────────────────────────────────────────────

  private static dedup(arr: string[]): string[] {
    const seen = new Set<string>();
    return arr.filter(s => {
      const key = this.normalizeKey(s);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
