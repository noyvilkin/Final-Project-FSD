/**
 * Resume-feature AI evaluation harness.
 *
 * Goal: produce concrete, defensible numbers for two project metrics:
 *
 *   - Zero Hallucination : every entity the AI extracts must be
 *                          grounded in the original resume text.
 *   - Relevance Boost    : the system's hybrid score must increase
 *                          after the AI optimizer rewrites bullets,
 *                          and JD keyword incorporation must rise.
 *
 * Run:
 *   npx tsx src/features/resume/eval/runEval.ts
 *   or
 *   npm run eval:resume
 *
 * Requires GEMINI_API_KEY in .env. No database connection is needed —
 * the harness uses ResumeParsingService.extractDNAFromText which does
 * not persist anything, and builds the optimization payload in-memory.
 */

import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { ResumeParsingService, type ParsedDNA } from '../services/resumeParsingService.js';
import { JdIngestionService } from '../services/jdIngestionService.js';
import { KeywordExtractor } from '../services/keywordExtractor.js';
import { EntityAlignmentService } from '../services/entityAlignmentService.js';
import { GeminiOptimizationService } from '../services/geminiOptimizationService.js';
import { HybridScoringService } from '../services/hybridScoringService.js';

import type { ResumeOptimizationPayload, ProfessionalDNASummary } from '../types/resumeOptimization.types.js';
import type { ISkill, IExperience, IEducation } from '../types/professionalDNA.types.js';

import { RESUME_FIXTURES, JD_FIXTURES, type ResumeFixture, type JDFixture } from './fixtures.js';
import { checkHallucinations, type HallucinationCheckResult } from './hallucinationCheck.js';
import {
  applyOptimizedBulletsToPayload,
  countKeywordIncorporation,
} from './relevanceBoost.js';
import { checkBulletFaithfulness, type FaithfulnessResult } from './bulletFaithfulness.js';

// ── Pretty printing ─────────────────────────────────────────────────

function header(text: string) {
  const line = '='.repeat(78);
  console.log(`\n${line}\n  ${text}\n${line}`);
}

function section(text: string) {
  console.log(`\n${'─'.repeat(78)}\n  ${text}\n${'─'.repeat(78)}`);
}

function pad(value: string | number, width: number, align: 'left' | 'right' = 'left'): string {
  const s = String(value);
  if (s.length >= width) return s.slice(0, width);
  return align === 'left' ? s.padEnd(width) : s.padStart(width);
}

// ── DNA → Payload helpers ───────────────────────────────────────────

/**
 * Converts the JSON-shaped ParsedDNA returned by Gemini into the
 * ProfessionalDNASummary the optimizer pipeline expects (Date objects,
 * IExperience/IEducation shapes).
 */
function dnaToSummary(parsed: ParsedDNA, rawResumeText: string): ProfessionalDNASummary {
  const skills: ISkill[] = parsed.skills.map((s) => ({
    name: s.name,
    category: s.category,
    proficiencyLevel: s.proficiencyLevel,
    yearsOfExperience: s.yearsOfExperience,
  }));

  const experience: IExperience[] = parsed.experience.map((e) => ({
    company: e.company,
    role: e.role,
    startDate: new Date(e.startDate),
    endDate: e.endDate ? new Date(e.endDate) : undefined,
    isCurrent: e.isCurrent,
    description: e.description,
    extractedSkills: e.extractedSkills,
  }));

  const education: IEducation[] = parsed.education.map((ed) => ({
    institution: ed.institution,
    degree: ed.degree,
    fieldOfStudy: ed.fieldOfStudy,
    startDate: new Date(ed.startDate),
    endDate: ed.endDate ? new Date(ed.endDate) : undefined,
    gpa: ed.gpa,
  }));

  return {
    userId: 'eval-user',
    skills,
    experience,
    education,
    skillNames: skills.map((s) => s.name),
    rawResumeText,
  };
}

function buildPayload(dna: ProfessionalDNASummary, jd: JDFixture): ResumeOptimizationPayload {
  const normalizedJD = JdIngestionService.fromText(jd.text);
  const extractedKeywords = KeywordExtractor.extract(normalizedJD.cleanText);
  const alignment = EntityAlignmentService.align(extractedKeywords, dna.skills);

  return {
    normalizedJD,
    extractedKeywords,
    professionalDNA: dna,
    alignment,
    meta: { generatedAt: new Date().toISOString(), version: '1.0.0-eval' },
  };
}

// ── Per-fixture eval ────────────────────────────────────────────────

interface ResumeEvalRow {
  fixtureId: string;
  candidateName: string | null;
  totalChecked: number;
  hallucinatedCount: number;
  hallucinationRate: number;
  hallucinatedItems: HallucinationCheckResult['hallucinated'];
}

interface PairEvalRow {
  resumeId: string;
  jdId: string;
  scoreBefore: number;
  scoreAfter: number;
  scoreBoost: number;
  keywordsBefore: number;
  keywordsAfter: number;
  keywordBoost: number;
  jdHardSkillCount: number;
  faithfulness: FaithfulnessResult;
}

interface FullEvalReport {
  generatedAt: string;
  resumes: ResumeEvalRow[];
  pairs: PairEvalRow[];
  summary: {
    avgHallucinationRate: number;
    totalHallucinations: number;
    avgScoreBoost: number;
    avgKeywordBoost: number;
    avgDnaSupportRate: number;
    totalUnsupportedKeywords: number;
    avgAtsRelevanceRate: number;
    avgMissingCoverageRate: number;
  };
}

async function evalResume(fixture: ResumeFixture): Promise<{
  row: ResumeEvalRow;
  dna: ProfessionalDNASummary;
}> {
  console.log(`\n[${fixture.id}] Extracting DNA via Gemini...`);
  const parsed = await ResumeParsingService.extractDNAFromText(fixture.text);

  const result = checkHallucinations(parsed, fixture.text);
  const dna = dnaToSummary(parsed, fixture.text);

  console.log(
    `  -> skills=${parsed.skills.length}  experience=${parsed.experience.length}  ` +
      `hallucinated=${result.hallucinated.length}/${result.totalChecked} ` +
      `(${(result.hallucinationRate * 100).toFixed(1)}%)`
  );

  return {
    row: {
      fixtureId: fixture.id,
      candidateName: parsed.candidateName,
      totalChecked: result.totalChecked,
      hallucinatedCount: result.hallucinated.length,
      hallucinationRate: result.hallucinationRate,
      hallucinatedItems: result.hallucinated,
    },
    dna,
  };
}

async function evalPair(
  resume: ResumeFixture,
  dna: ProfessionalDNASummary,
  jd: JDFixture
): Promise<PairEvalRow> {
  console.log(`\n[${resume.id} x ${jd.id}] Optimizing + scoring...`);
  const payload = buildPayload(dna, jd);

  const keywordsBefore = countKeywordIncorporation(
    payload.professionalDNA.experience,
    payload.extractedKeywords.hardSkills
  );

  const optimization = await GeminiOptimizationService.optimizeResume(payload);
  const scoreBefore = optimization.hybridScore.finalScore;

  const payloadAfter = applyOptimizedBulletsToPayload(payload, optimization);
  const hybridAfter = await HybridScoringService.calculateHybridScore(payloadAfter);
  const scoreAfter = hybridAfter.finalScore;

  const keywordsAfter = countKeywordIncorporation(
    payloadAfter.professionalDNA.experience,
    payload.extractedKeywords.hardSkills
  );

  const faithfulness = checkBulletFaithfulness(
    optimization,
    payload.professionalDNA,
    payload.extractedKeywords,
    payload.alignment
  );

  console.log(
    `  -> score: ${scoreBefore} → ${scoreAfter} (boost ${scoreAfter - scoreBefore >= 0 ? '+' : ''}${scoreAfter - scoreBefore})  ` +
      `keywords: ${keywordsBefore.matched.length} → ${keywordsAfter.matched.length} of ${payload.extractedKeywords.hardSkills.length}`
  );
  console.log(
    `     DNA-support: ${faithfulness.totalSupported}/${faithfulness.totalKeywordsUsed} ` +
      `(${(faithfulness.dnaSupportRate * 100).toFixed(1)}%)  ` +
      `ATS-relevant: ${(faithfulness.atsRelevanceRate * 100).toFixed(1)}%  ` +
      `gap-coverage: ${faithfulness.missingSkillsSurfaced}/${faithfulness.missingSkillsTotal}`
  );

  return {
    resumeId: resume.id,
    jdId: jd.id,
    scoreBefore,
    scoreAfter,
    scoreBoost: scoreAfter - scoreBefore,
    keywordsBefore: keywordsBefore.matched.length,
    keywordsAfter: keywordsAfter.matched.length,
    keywordBoost: keywordsAfter.matched.length - keywordsBefore.matched.length,
    jdHardSkillCount: payload.extractedKeywords.hardSkills.length,
    faithfulness,
  };
}

// ── Reporting ───────────────────────────────────────────────────────

function printHallucinationTable(rows: ResumeEvalRow[]) {
  section('ZERO HALLUCINATION CHECK');
  console.log(
    `  ${pad('Resume', 24)} ${pad('Items', 7, 'right')} ${pad('Hallucinated', 13, 'right')} ${pad(
      'Rate',
      8,
      'right'
    )}`
  );
  console.log(`  ${'-'.repeat(54)}`);

  let totalChecked = 0;
  let totalHallucinated = 0;
  for (const r of rows) {
    totalChecked += r.totalChecked;
    totalHallucinated += r.hallucinatedCount;
    console.log(
      `  ${pad(r.fixtureId, 24)} ${pad(r.totalChecked, 7, 'right')} ` +
        `${pad(r.hallucinatedCount, 13, 'right')} ${pad((r.hallucinationRate * 100).toFixed(1) + '%', 8, 'right')}`
    );
  }
  console.log(`  ${'-'.repeat(54)}`);
  const overallRate = totalChecked === 0 ? 0 : totalHallucinated / totalChecked;
  console.log(
    `  ${pad('TOTAL', 24)} ${pad(totalChecked, 7, 'right')} ${pad(totalHallucinated, 13, 'right')} ` +
      `${pad((overallRate * 100).toFixed(1) + '%', 8, 'right')}`
  );

  for (const r of rows) {
    if (r.hallucinatedItems.length > 0) {
      console.log(`\n  ! ${r.fixtureId} hallucinated entities:`);
      for (const item of r.hallucinatedItems) {
        console.log(`      - [${item.field}] "${item.value}"`);
      }
    }
  }
}

function printRelevanceTable(rows: PairEvalRow[]) {
  section('RELEVANCE BOOST');
  console.log(
    `  ${pad('Resume', 20)} ${pad('JD', 22)} ${pad('Before', 7, 'right')} ${pad('After', 6, 'right')} ` +
      `${pad('Boost', 7, 'right')} ${pad('KW++', 6, 'right')}`
  );
  console.log(`  ${'-'.repeat(72)}`);

  let totalBefore = 0;
  let totalAfter = 0;
  let totalKwBoost = 0;
  for (const r of rows) {
    totalBefore += r.scoreBefore;
    totalAfter += r.scoreAfter;
    totalKwBoost += r.keywordBoost;
    const sign = r.scoreBoost >= 0 ? '+' : '';
    console.log(
      `  ${pad(r.resumeId, 20)} ${pad(r.jdId, 22)} ${pad(r.scoreBefore, 7, 'right')} ` +
        `${pad(r.scoreAfter, 6, 'right')} ${pad(`${sign}${r.scoreBoost}`, 7, 'right')} ${pad(
          (r.keywordBoost >= 0 ? '+' : '') + r.keywordBoost,
          6,
          'right'
        )}`
    );
  }
  console.log(`  ${'-'.repeat(72)}`);
  const n = rows.length || 1;
  const avgBefore = totalBefore / n;
  const avgAfter = totalAfter / n;
  const avgBoost = avgAfter - avgBefore;
  const avgKw = totalKwBoost / n;
  console.log(
    `  ${pad('AVERAGE', 20)} ${pad('', 22)} ${pad(avgBefore.toFixed(1), 7, 'right')} ` +
      `${pad(avgAfter.toFixed(1), 6, 'right')} ${pad((avgBoost >= 0 ? '+' : '') + avgBoost.toFixed(1), 7, 'right')} ` +
      `${pad((avgKw >= 0 ? '+' : '') + avgKw.toFixed(1), 6, 'right')}`
  );
}

function printFaithfulnessTable(rows: PairEvalRow[]) {
  section('OPTIMIZATION FAITHFULNESS  (100% DNA-support, ATS-friendly, gap coverage)');
  console.log(
    `  ${pad('Resume', 20)} ${pad('JD', 22)} ${pad('Used', 5, 'right')} ${pad('Supp', 5, 'right')} ` +
      `${pad('DNA%', 6, 'right')} ${pad('ATS%', 6, 'right')} ${pad('Gap%', 6, 'right')}`
  );
  console.log(`  ${'-'.repeat(78)}`);

  let totalUsed = 0;
  let totalSupported = 0;
  let totalAts = 0;
  let totalMissing = 0;
  let totalSurfaced = 0;

  for (const r of rows) {
    const f = r.faithfulness;
    totalUsed += f.totalKeywordsUsed;
    totalSupported += f.totalSupported;
    totalAts += f.totalAtsKeywords;
    totalMissing += f.missingSkillsTotal;
    totalSurfaced += f.missingSkillsSurfaced;

    console.log(
      `  ${pad(r.resumeId, 20)} ${pad(r.jdId, 22)} ${pad(f.totalKeywordsUsed, 5, 'right')} ` +
        `${pad(f.totalSupported, 5, 'right')} ${pad((f.dnaSupportRate * 100).toFixed(1) + '%', 6, 'right')} ` +
        `${pad((f.atsRelevanceRate * 100).toFixed(1) + '%', 6, 'right')} ` +
        `${pad(
          f.missingSkillsTotal === 0 ? 'n/a' : (f.missingCoverageRate * 100).toFixed(0) + '%',
          6,
          'right'
        )}`
    );
  }
  console.log(`  ${'-'.repeat(78)}`);

  const overallDna = totalUsed === 0 ? 1 : totalSupported / totalUsed;
  const overallAts = totalUsed === 0 ? 0 : totalAts / totalUsed;
  const overallGap = totalMissing === 0 ? 1 : totalSurfaced / totalMissing;
  console.log(
    `  ${pad('OVERALL', 20)} ${pad('', 22)} ${pad(totalUsed, 5, 'right')} ` +
      `${pad(totalSupported, 5, 'right')} ${pad((overallDna * 100).toFixed(1) + '%', 6, 'right')} ` +
      `${pad((overallAts * 100).toFixed(1) + '%', 6, 'right')} ` +
      `${pad((overallGap * 100).toFixed(0) + '%', 6, 'right')}`
  );

  // Detail: list every unsupported (hallucinated) keyword
  for (const r of rows) {
    for (const b of r.faithfulness.bullets) {
      if (b.unsupportedKeywords.length > 0) {
        console.log(
          `\n  ! [${r.resumeId} x ${r.jdId}] bullet #${b.index} hallucinated keywords:`
        );
        for (const kw of b.unsupportedKeywords) console.log(`      - "${kw}"`);
      }
    }
  }

  console.log(
    `\n  Legend: DNA% = ${'\u2265'} 100% means every keyword the optimizer used is grounded in the candidate's DNA.`
  );
  console.log(
    `          ATS% = % of used keywords that are hard skills / tools / certifications (high-impact for ATS).`
  );
  console.log(
    `          Gap% = % of alignment.missingSkills surfaced back to the user as gapsRemaining.`
  );
}

function writeJsonReport(report: FullEvalReport) {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const outDir = join(__dirname, '..', '..', '..', '..', 'eval-reports');
  mkdirSync(outDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = join(outDir, `resume-eval-${stamp}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n  Report saved to: ${path}`);
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  header('Resume AI Evaluation Harness');

  if (!process.env.GEMINI_API_KEY) {
    console.error('\n  ERROR: GEMINI_API_KEY is not set in .env\n');
    process.exit(1);
  }

  console.log(`  Resume fixtures : ${RESUME_FIXTURES.length}`);
  console.log(`  JD fixtures     : ${JD_FIXTURES.length}`);
  console.log(`  Pairs to score  : ${RESUME_FIXTURES.length * JD_FIXTURES.length}`);
  console.log(
    `  Approx Gemini calls: ${RESUME_FIXTURES.length + RESUME_FIXTURES.length * JD_FIXTURES.length * 3}` +
      ` (1 extract + 3 per pair)`
  );

  // Phase 1: hallucination check on every resume
  section('Phase 1 — DNA extraction + grounding check');
  const resumeRows: ResumeEvalRow[] = [];
  const dnaByFixture = new Map<string, ProfessionalDNASummary>();

  for (const fixture of RESUME_FIXTURES) {
    const { row, dna } = await evalResume(fixture);
    resumeRows.push(row);
    dnaByFixture.set(fixture.id, dna);
  }

  // Phase 2: relevance boost on every (resume, JD) pair
  section('Phase 2 — Relevance boost (optimize + score before/after)');
  const pairRows: PairEvalRow[] = [];
  for (const resume of RESUME_FIXTURES) {
    const dna = dnaByFixture.get(resume.id);
    if (!dna) continue;
    for (const jd of JD_FIXTURES) {
      try {
        const row = await evalPair(resume, dna, jd);
        pairRows.push(row);
      } catch (err) {
        console.error(
          `  FAILED [${resume.id} x ${jd.id}]: ${err instanceof Error ? err.message : 'Unknown'}`
        );
      }
    }
  }

  // Final report
  printHallucinationTable(resumeRows);
  printRelevanceTable(pairRows);
  printFaithfulnessTable(pairRows);

  const totalChecked = resumeRows.reduce((acc, r) => acc + r.totalChecked, 0);
  const totalHallucinated = resumeRows.reduce((acc, r) => acc + r.hallucinatedCount, 0);
  const avgScoreBoost =
    pairRows.length === 0 ? 0 : pairRows.reduce((acc, r) => acc + r.scoreBoost, 0) / pairRows.length;
  const avgKeywordBoost =
    pairRows.length === 0
      ? 0
      : pairRows.reduce((acc, r) => acc + r.keywordBoost, 0) / pairRows.length;

  const totalKwUsed = pairRows.reduce((acc, r) => acc + r.faithfulness.totalKeywordsUsed, 0);
  const totalKwSupported = pairRows.reduce((acc, r) => acc + r.faithfulness.totalSupported, 0);
  const totalKwUnsupported = totalKwUsed - totalKwSupported;
  const totalAts = pairRows.reduce((acc, r) => acc + r.faithfulness.totalAtsKeywords, 0);
  const totalMissing = pairRows.reduce((acc, r) => acc + r.faithfulness.missingSkillsTotal, 0);
  const totalSurfaced = pairRows.reduce((acc, r) => acc + r.faithfulness.missingSkillsSurfaced, 0);

  const avgDnaSupportRate = totalKwUsed === 0 ? 1 : totalKwSupported / totalKwUsed;
  const avgAtsRelevanceRate = totalKwUsed === 0 ? 0 : totalAts / totalKwUsed;
  const avgMissingCoverageRate = totalMissing === 0 ? 1 : totalSurfaced / totalMissing;

  const report: FullEvalReport = {
    generatedAt: new Date().toISOString(),
    resumes: resumeRows,
    pairs: pairRows,
    summary: {
      avgHallucinationRate: totalChecked === 0 ? 0 : totalHallucinated / totalChecked,
      totalHallucinations: totalHallucinated,
      avgScoreBoost,
      avgKeywordBoost,
      avgDnaSupportRate,
      totalUnsupportedKeywords: totalKwUnsupported,
      avgAtsRelevanceRate,
      avgMissingCoverageRate,
    },
  };

  writeJsonReport(report);

  header('EVALUATION COMPLETE');
  console.log(`  Extraction hallucination rate: ${(report.summary.avgHallucinationRate * 100).toFixed(2)}%`);
  console.log(
    `  Avg score boost              : ${avgScoreBoost >= 0 ? '+' : ''}${avgScoreBoost.toFixed(1)} points`
  );
  console.log(
    `  Avg keyword boost            : ${avgKeywordBoost >= 0 ? '+' : ''}${avgKeywordBoost.toFixed(1)} keywords / pair`
  );
  console.log(
    `  Optimizer DNA-support rate   : ${(avgDnaSupportRate * 100).toFixed(2)}%  (${totalKwUnsupported} unsupported / ${totalKwUsed} total)`
  );
  console.log(
    `  Optimizer ATS-relevance rate : ${(avgAtsRelevanceRate * 100).toFixed(2)}%`
  );
  console.log(
    `  Missing-keyword coverage     : ${(avgMissingCoverageRate * 100).toFixed(0)}%  (${totalSurfaced}/${totalMissing} gaps surfaced)`
  );

  if (totalKwUnsupported > 0) {
    console.log(
      `\n  REQUIREMENT NOT MET: ${totalKwUnsupported} keyword(s) used by the optimizer were not supported by the user's DNA. See faithfulness table above.`
    );
  } else if (totalKwUsed > 0) {
    console.log(
      `\n  REQUIREMENT MET: 100% of suggested keyword additions are grounded in the user's Professional DNA across ${pairRows.length} (resume, JD) pairs.`
    );
  }
}

main().catch((err) => {
  console.error(`\n  EVAL FAILED: ${err instanceof Error ? err.message : err}\n`);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
