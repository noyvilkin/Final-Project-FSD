/**
 * POC Test — Resume Optimization Pipeline (Task #19)
 *
 * Tests all three layers:
 *   1. AI Optimization (Gemini bullet rewriting)
 *   2. Hybrid Scoring  (Hard-rule 40% + Semantic 60%)
 *   3. Adapter Pattern (raw Gemini → UI state)
 *
 * Usage:
 *   cd backend
 *   npm run poc:optimize
 *
 * Requires:
 *   - GEMINI_API_KEY in .env
 *   - MongoDB running (MONGODB_URI in .env)
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { GeminiClient } from '../../../common/services/geminiClient.js';
import { OptimizationPromptBuilder } from '../prompts/optimizationPrompts.js';
import { GeminiResponseAdapter } from '../adapters/geminiAdapter.js';
import { ScoringService } from '../services/scoringService.js';
import { ProfessionalDNA } from '../models/professionalDNA.model.js';
import type {
  OptimizationPayload,
  JobDescriptionInput,
  BulletToOptimize,
  GeminiOptimizationResponse,
} from '../types/optimization.types.js';

// ── Helpers ─────────────────────────────────────────────────────────

const divider = (title: string) => {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'─'.repeat(60)}`);
};

const banner = (text: string) => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${text}`);
  console.log(`${'='.repeat(60)}\n`);
};

// ── Sample Data ─────────────────────────────────────────────────────

const SAMPLE_JD: JobDescriptionInput = {
  title: 'Senior Full-Stack Engineer',
  company: 'TechCorp',
  description: `We are looking for a Senior Full-Stack Engineer to join our growing
engineering team. You will design, build, and maintain scalable web applications
using modern technologies. You'll work closely with product and design teams to
deliver high-quality features. Experience with cloud infrastructure (AWS) and
containerization is a plus.`,
  requiredSkills: [
    'TypeScript', 'React', 'Node.js', 'MongoDB', 'AWS',
    'Docker', 'REST API', 'PostgreSQL', 'CI/CD',
  ],
  preferredSkills: ['GraphQL', 'Kubernetes', 'Redis'],
  coreResponsibilities: [
    'Design and implement scalable full-stack web applications',
    'Build RESTful APIs and microservices with Node.js',
    'Develop responsive UIs using React and TypeScript',
    'Deploy and manage services on AWS infrastructure',
    'Write unit and integration tests to maintain code quality',
    'Mentor junior developers and conduct code reviews',
  ],
};

const SAMPLE_BULLETS: BulletToOptimize[] = [
  {
    experienceIndex: 0,
    originalBullet: 'Built web apps using React and Node',
    role: 'Full Stack Developer',
    company: 'StartupXYZ',
  },
  {
    experienceIndex: 1,
    originalBullet: 'Worked on backend services and databases',
    role: 'Software Engineer',
    company: 'BigCo',
  },
  {
    experienceIndex: 2,
    originalBullet: 'Helped deploy applications to the cloud',
    role: 'Junior Developer',
    company: 'DevShop',
  },
];

// ── Stage 1: Test Hard-Rule Scoring (no AI needed) ──────────────────

async function testHardRuleScoring() {
  divider('STAGE 1: Hard-Rule Skill Matching (no AI)');

  const mockDna = {
    skills: [
      { name: 'TypeScript', category: 'technical' as const, proficiencyLevel: 'advanced' as const, yearsOfExperience: 4 },
      { name: 'React', category: 'technical' as const, proficiencyLevel: 'advanced' as const, yearsOfExperience: 4 },
      { name: 'Node.js', category: 'technical' as const, proficiencyLevel: 'advanced' as const, yearsOfExperience: 5 },
      { name: 'MongoDB', category: 'technical' as const, proficiencyLevel: 'advanced' as const, yearsOfExperience: 3 },
      { name: 'Docker', category: 'tool' as const, proficiencyLevel: 'intermediate' as const, yearsOfExperience: 2 },
      { name: 'REST API', category: 'technical' as const, proficiencyLevel: 'advanced' as const, yearsOfExperience: 5 },
      { name: 'Jest', category: 'tool' as const, proficiencyLevel: 'intermediate' as const, yearsOfExperience: 2 },
    ],
    experience: [
      { company: 'StartupXYZ', role: 'Full Stack Developer', startDate: new Date('2021-01-01'), isCurrent: false, description: 'Built web apps using React and Node', extractedSkills: ['React', 'Node.js', 'TypeScript'] },
      { company: 'BigCo', role: 'Software Engineer', startDate: new Date('2019-06-01'), endDate: new Date('2020-12-31'), isCurrent: false, description: 'Worked on backend services and databases', extractedSkills: ['Node.js', 'MongoDB', 'Express'] },
      { company: 'DevShop', role: 'Junior Developer', startDate: new Date('2018-01-01'), endDate: new Date('2019-05-31'), isCurrent: false, description: 'Helped deploy applications to the cloud', extractedSkills: ['JavaScript', 'HTML', 'CSS'] },
    ],
    education: [
      { institution: 'Tel Aviv University', degree: 'BSc', fieldOfStudy: 'Computer Science', startDate: new Date('2014-10-01'), endDate: new Date('2018-06-01') },
    ],
  } as any;

  const result = ScoringService.calculateHardRuleMatch(mockDna, SAMPLE_JD);

  console.log(`\nRequired skills: ${result.totalRequired}`);
  console.log(`\nMatched (${result.matchedSkills.length}):`);
  result.matchedSkills.forEach(s => console.log(`  ✓ ${s}`));
  console.log(`\nMissing (${result.missingSkills.length}):`);
  result.missingSkills.forEach(s => console.log(`  ✗ ${s}`));
  console.log(`\nHard-Rule Score: ${result.score}/100`);
  console.log(`  [${'█'.repeat(Math.round(result.score / 5))}${'░'.repeat(20 - Math.round(result.score / 5))}] ${result.score}%`);

  return { mockDna, result };
}

// ── Stage 2: Test Prompt Builder ────────────────────────────────────

function testPromptBuilder(mockDna: any) {
  divider('STAGE 2: Prompt Builder');

  const builder = new OptimizationPromptBuilder('v1');
  console.log(`Prompt version: ${builder.currentVersion}`);
  console.log(`Release date  : ${builder.releaseDate}`);

  const payload: OptimizationPayload = {
    professionalDNAId: 'test-id',
    jobDescription: SAMPLE_JD,
    bulletsToOptimize: SAMPLE_BULLETS,
    skills: mockDna.skills,
    experience: mockDna.experience,
  };

  const geminiPayload = builder.buildOptimizationPayload(payload);

  console.log(`\nSystem instruction length: ${geminiPayload.system_instruction!.parts[0].text.length} chars`);
  console.log(`User message length     : ${geminiPayload.contents[0].parts[0].text.length} chars`);
  console.log(`\nSystem instruction preview (first 200 chars):`);
  console.log(`"${geminiPayload.system_instruction!.parts[0].text.substring(0, 200)}..."`);

  return { builder, payload };
}

// ── Stage 3: Test Gemini Optimization (requires API key) ────────────

async function testGeminiOptimization(builder: OptimizationPromptBuilder, payload: OptimizationPayload) {
  divider('STAGE 3: Gemini AI Optimization (live API call)');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your-gemini-api-key-here') {
    console.log('⚠️  SKIPPED — Set GEMINI_API_KEY in backend/.env to run this stage');
    return null;
  }

  const client = new GeminiClient({
    apiKey,
    model: 'gemini-2.5-flash',
    temperature: 0.4,
    maxOutputTokens: 4096,
  });

  const geminiPayload = builder.buildOptimizationPayload(payload);
  console.log('Calling Gemini API...');

  const startTime = Date.now();
  const rawResponse = await client.generate(geminiPayload);
  const elapsed = Date.now() - startTime;

  console.log(`Response received in ${elapsed}ms (${rawResponse.length} chars)`);

  let parsed: GeminiOptimizationResponse;
  try {
    let cleaned = rawResponse.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
  } catch {
    console.error('Failed to parse response:', rawResponse.substring(0, 500));
    return null;
  }

  console.log(`\nOptimized ${parsed.optimizedBullets?.length || 0} bullets:`);
  parsed.optimizedBullets?.forEach((b, i) => {
    console.log(`\n  [${i + 1}] Experience Index: ${b.experienceIndex}`);
    console.log(`  Original  : "${b.originalBullet}"`);
    console.log(`  Optimized : "${b.optimizedBullet}"`);
    console.log(`  Confidence: ${b.confidenceScore}`);
    console.log(`  Explanation: ${b.explanation}`);
    console.log(`  Keywords  : ${b.keywordsUsed?.join(', ')}`);
  });

  console.log(`\nOverall notes: ${parsed.overallNotes}`);
  return parsed;
}

// ── Stage 4: Test Adapter Pattern ───────────────────────────────────

function testAdapter(parsed: GeminiOptimizationResponse | null) {
  divider('STAGE 4: Adapter Pattern (Gemini → UI State)');

  if (!parsed) {
    const mockResponse: GeminiOptimizationResponse = {
      optimizedBullets: [
        {
          experienceIndex: 0,
          originalBullet: 'Built web apps using React and Node',
          optimizedBullet: 'Designed and developed scalable full-stack web applications using React and Node.js, serving 10K+ daily users with TypeScript-based architecture.',
          explanation: 'Added specificity, quantified impact, and incorporated TypeScript keyword from JD.',
          confidenceScore: 0.85,
          keywordsUsed: ['React', 'Node.js', 'TypeScript', 'scalable'],
        },
        {
          experienceIndex: 1,
          originalBullet: 'Worked on backend services and databases',
          optimizedBullet: 'Engineered RESTful API microservices with Node.js and MongoDB, implementing CI/CD pipelines to automate deployment workflows.',
          explanation: 'Transformed vague description into specific ATS-friendly bullet with JD keywords.',
          confidenceScore: 0.62,
          keywordsUsed: ['REST API', 'Node.js', 'MongoDB', 'CI/CD'],
        },
        {
          experienceIndex: 2,
          originalBullet: 'Helped deploy applications to the cloud',
          optimizedBullet: 'Deployed containerized applications to AWS using Docker, reducing deployment time by 40% through infrastructure automation.',
          explanation: 'Added AWS and Docker keywords with quantified improvement. The 40% claim is inferred.',
          confidenceScore: 0.45,
          keywordsUsed: ['AWS', 'Docker'],
        },
      ],
      overallNotes: 'Mock response for adapter testing.',
    };
    console.log('Using mock Gemini response (no live API result available)\n');
    parsed = mockResponse;
  }

  const uiBullets = GeminiResponseAdapter.toUIState(parsed, SAMPLE_BULLETS);

  console.log(`Adapted ${uiBullets.length} bullets to UI state:\n`);
  uiBullets.forEach((b, i) => {
    const colors: Record<string, string> = { high: '🟢', medium: '🟡', low: '🔴' };
    console.log(`  [${i + 1}] ${b.role} at ${b.company}`);
    console.log(`      ID             : ${b.id}`);
    console.log(`      Original       : "${b.originalBullet}"`);
    console.log(`      Optimized      : "${b.optimizedBullet}"`);
    console.log(`      Editable copy  : "${b.editedBullet}"`);
    console.log(`      Confidence     : ${colors[b.confidenceLevel]} ${b.confidenceLevel} (${b.confidenceScore})`);
    console.log(`      Status         : ${b.status}`);
    console.log(`      Keywords       : ${b.keywordsUsed.join(', ')}`);
  });

  return uiBullets;
}

// ── Stage 5: Test Semantic Scoring (requires API key) ───────────────

async function testSemanticScoring(mockDna: any, builder: OptimizationPromptBuilder) {
  divider('STAGE 5: Hybrid Scoring (Hard-Rule + Semantic)');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your-gemini-api-key-here') {
    console.log('⚠️  SKIPPED — Set GEMINI_API_KEY in backend/.env to run this stage');
    console.log('   (Hard-rule scoring was already tested in Stage 1)\n');
    return;
  }

  const client = new GeminiClient({
    apiKey,
    model: 'gemini-2.5-flash',
    temperature: 0.3,
    maxOutputTokens: 2048,
  });

  console.log('Calling Gemini for semantic evaluation...');
  const startTime = Date.now();
  const hybridScore = await ScoringService.calculateHybridScore(
    mockDna, SAMPLE_JD, client, builder,
  );
  const elapsed = Date.now() - startTime;
  console.log(`Completed in ${elapsed}ms\n`);

  console.log(`  Final Score    : ${hybridScore.finalScore}/100`);
  console.log(`  Hard-Rule (40%): ${hybridScore.hardRuleMatch.score}/100`);
  console.log(`  Semantic  (60%): ${hybridScore.semanticSimilarity.score}/100`);
  console.log(`  [${'█'.repeat(Math.round(hybridScore.finalScore / 5))}${'░'.repeat(20 - Math.round(hybridScore.finalScore / 5))}] ${hybridScore.finalScore}%`);

  if (hybridScore.semanticSimilarity.topMatchingAreas.length) {
    console.log(`\n  Strong alignment:`);
    hybridScore.semanticSimilarity.topMatchingAreas.forEach(a => console.log(`    ✓ ${a}`));
  }
  if (hybridScore.semanticSimilarity.weakAreas.length) {
    console.log(`\n  Weak alignment:`);
    hybridScore.semanticSimilarity.weakAreas.forEach(a => console.log(`    ✗ ${a}`));
  }

  if (hybridScore.gapsRemaining.length) {
    console.log(`\n  Gaps remaining (${hybridScore.gapsRemaining.length}):`);
    hybridScore.gapsRemaining.forEach(g => console.log(`    • ${g}`));
  }
}

// ── Stage 6: E2E with MongoDB (optional) ────────────────────────────

async function testE2EWithMongo() {
  divider('STAGE 6: End-to-End with MongoDB (optional)');

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.log('⚠️  SKIPPED — MONGODB_URI not set');
    return;
  }

  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB\n');

    const testDna = await ProfessionalDNA.create({
      userId: new mongoose.Types.ObjectId(),
      skills: [
        { name: 'TypeScript', category: 'technical', proficiencyLevel: 'advanced', yearsOfExperience: 4 },
        { name: 'React', category: 'technical', proficiencyLevel: 'advanced', yearsOfExperience: 4 },
        { name: 'Node.js', category: 'technical', proficiencyLevel: 'advanced', yearsOfExperience: 5 },
        { name: 'MongoDB', category: 'technical', proficiencyLevel: 'advanced', yearsOfExperience: 3 },
        { name: 'Docker', category: 'tool', proficiencyLevel: 'intermediate', yearsOfExperience: 2 },
        { name: 'REST API', category: 'technical', proficiencyLevel: 'advanced', yearsOfExperience: 5 },
      ],
      experience: [
        { company: 'StartupXYZ', role: 'Full Stack Developer', startDate: new Date('2021-01-01'), isCurrent: true, description: 'Built web apps using React and Node', extractedSkills: ['React', 'Node.js'] },
        { company: 'BigCo', role: 'Software Engineer', startDate: new Date('2019-06-01'), endDate: new Date('2020-12-31'), isCurrent: false, description: 'Worked on backend services and databases', extractedSkills: ['Node.js', 'MongoDB'] },
      ],
      education: [
        { institution: 'Tel Aviv University', degree: 'BSc', fieldOfStudy: 'Computer Science', startDate: new Date('2014-10-01'), endDate: new Date('2018-06-01') },
      ],
      analysisStatus: 'completed',
    });

    console.log(`Created test ProfessionalDNA: ${testDna._id}`);
    console.log(`\nYou can now test the API with curl:`);
    console.log(`\ncurl -X POST http://localhost:4000/api/resume/optimize \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -d '{`);
    console.log(`    "professionalDNAId": "${testDna._id}",`);
    console.log(`    "jobDescription": {`);
    console.log(`      "title": "Senior Full-Stack Engineer",`);
    console.log(`      "requiredSkills": ["TypeScript","React","Node.js","AWS","Docker"],`);
    console.log(`      "coreResponsibilities": ["Build scalable web apps","Design REST APIs"],`);
    console.log(`      "description": "We need a senior engineer..."  `);
    console.log(`    }`);
    console.log(`  }'`);

    // Cleanup
    await ProfessionalDNA.findByIdAndDelete(testDna._id);
    console.log(`\nCleaned up test document.`);
    await mongoose.disconnect();
  } catch (err) {
    console.log(`MongoDB test skipped: ${(err as Error).message}`);
    try { await mongoose.disconnect(); } catch { /* ignore */ }
  }
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  banner('Resume Optimization POC Test (Task #19)');
  console.log('Testing: AI bullet rewriting, Hybrid scoring, Adapter pattern\n');

  const { mockDna } = await testHardRuleScoring();
  const { builder, payload } = testPromptBuilder(mockDna);
  const parsed = await testGeminiOptimization(builder, payload);
  testAdapter(parsed);
  await testSemanticScoring(mockDna, builder);
  await testE2EWithMongo();

  banner('POC TEST COMPLETED');
}

main().catch(err => {
  console.error('POC failed:', err);
  process.exit(1);
});
