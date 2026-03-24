/**
 * POC test for the AI Optimization + Hybrid Scoring pipeline.
 *
 * Run:  npx tsx src/features/resume/POC/poc-ai-optimization-test.ts
 *   or: npm run poc:optimize
 *
 * Requires: GEMINI_API_KEY in .env (no database needed).
 */

import 'dotenv/config';
import { JdIngestionService } from '../services/jdIngestionService.js';
import { KeywordExtractor } from '../services/keywordExtractor.js';
import { EntityAlignmentService } from '../services/entityAlignmentService.js';
import { GeminiOptimizationService } from '../services/geminiOptimizationService.js';
import type { ISkill, IExperience, IEducation } from '../types/professionalDNA.types.js';
import type { ResumeOptimizationPayload, ProfessionalDNASummary } from '../types/resumeOptimization.types.js';

function printHeader(text: string) {
  const line = '='.repeat(60);
  console.log(`\n${line}\n${text}\n${line}`);
}

function printSection(title: string) {
  console.log(`\n${'─'.repeat(60)}\n${title}\n${'─'.repeat(60)}`);
}

// ── Sample data ─────────────────────────────────────────────────────

const SAMPLE_JD = `
Senior Full-Stack Engineer

We are looking for a Senior Full-Stack Engineer to join our growing engineering team.
You will design, build, and maintain scalable web applications using modern technologies.

Requirements:
- 5+ years of professional software development experience
- Strong proficiency in TypeScript and JavaScript
- Production experience with React on the frontend
- Backend experience with Node.js (Express or NestJS)
- Solid experience with MongoDB and PostgreSQL
- Hands-on experience with Docker and Kubernetes
- Experience with AWS services (EC2, S3, Lambda)
- Familiarity with CI/CD pipelines (GitHub Actions or Jenkins)
- Understanding of REST API design and GraphQL
- Experience with Redis for caching
- Agile / Scrum methodologies

Nice to Have:
- AWS Certified Solutions Architect
- Terraform for infrastructure as code
- Experience with Kafka or RabbitMQ
- Knowledge of Machine Learning concepts
- TDD and Jest testing
`;

const MOCK_SKILLS: ISkill[] = [
  { name: 'TypeScript',   category: 'technical', proficiencyLevel: 'advanced',     yearsOfExperience: 4 },
  { name: 'JavaScript',   category: 'technical', proficiencyLevel: 'expert',       yearsOfExperience: 6 },
  { name: 'React',        category: 'technical', proficiencyLevel: 'advanced',     yearsOfExperience: 4 },
  { name: 'Node.js',      category: 'technical', proficiencyLevel: 'advanced',     yearsOfExperience: 5 },
  { name: 'Express',      category: 'technical', proficiencyLevel: 'advanced',     yearsOfExperience: 5 },
  { name: 'MongoDB',      category: 'technical', proficiencyLevel: 'advanced',     yearsOfExperience: 3 },
  { name: 'Docker',       category: 'tool',      proficiencyLevel: 'intermediate', yearsOfExperience: 2 },
  { name: 'REST API',     category: 'technical', proficiencyLevel: 'advanced',     yearsOfExperience: 5 },
  { name: 'Jest',         category: 'technical', proficiencyLevel: 'intermediate', yearsOfExperience: 2 },
  { name: 'Agile',        category: 'soft',      proficiencyLevel: 'advanced',     yearsOfExperience: 4 },
];

const MOCK_EXPERIENCE: IExperience[] = [
  {
    company: 'TechCorp',
    role: 'Full-Stack Developer',
    startDate: new Date('2021-03-01'),
    endDate: undefined,
    isCurrent: true,
    description: 'Developed web applications using React and Node.js. Managed databases and deployed to cloud.',
    extractedSkills: ['React', 'Node.js', 'MongoDB'],
  },
  {
    company: 'StartupXYZ',
    role: 'Junior Developer',
    startDate: new Date('2019-06-01'),
    endDate: new Date('2021-02-28'),
    isCurrent: false,
    description: 'Built REST APIs with Express. Worked on frontend components using JavaScript and CSS.',
    extractedSkills: ['Express', 'JavaScript', 'REST API'],
  },
];

const MOCK_EDUCATION: IEducation[] = [
  {
    institution: 'University of Technology',
    degree: 'BSc',
    fieldOfStudy: 'Computer Science',
    startDate: new Date('2015-09-01'),
    endDate: new Date('2019-06-01'),
  },
];

// ── Build payload without DB ────────────────────────────────────────

function buildMockPayload(): ResumeOptimizationPayload {
  const normalizedJD = JdIngestionService.fromText(SAMPLE_JD);
  const keywords = KeywordExtractor.extract(normalizedJD.cleanText);

  const dna: ProfessionalDNASummary = {
    userId: 'mock-user-poc',
    skills: MOCK_SKILLS,
    experience: MOCK_EXPERIENCE,
    education: MOCK_EDUCATION,
    skillNames: MOCK_SKILLS.map(s => s.name),
  };

  const alignment = EntityAlignmentService.align(keywords, dna.skills);

  return {
    normalizedJD,
    extractedKeywords: keywords,
    professionalDNA: dna,
    alignment,
    meta: { generatedAt: new Date().toISOString(), version: '1.0.0' },
  };
}

// ── Run ───────────────────────────────────────────────────────────

async function main() {
  printHeader('AI Resume Optimization POC');

  if (!process.env.GEMINI_API_KEY) {
    console.error('\n  ERROR: GEMINI_API_KEY not set in .env\n');
    process.exit(1);
  }

  console.log('Building mock payload...');
  const payload = buildMockPayload();

  printSection('Alignment (pre-optimization)');
  console.log(`  Relevance Score : ${payload.alignment.relevanceScore}%`);
  console.log(`  Matching Skills : ${payload.alignment.matchingSkills.join(', ')}`);
  console.log(`  Missing Skills  : ${payload.alignment.missingSkills.join(', ')}`);

  printSection('Calling Gemini for optimization + scoring...');
  console.log('  (This may take 15-30 seconds)\n');

  const result = await GeminiOptimizationService.optimizeResume(payload);

  printSection('Hybrid Score');
  console.log(`  Final Score     : ${result.hybridScore.finalScore}/100`);
  console.log(`  Hard Rule (40%) : ${result.hybridScore.hardRuleScore}/100 (${result.hybridScore.hardRuleDetails.totalMatched}/${result.hybridScore.hardRuleDetails.totalRequired} skills)`);
  console.log(`  Semantic  (60%) : ${result.hybridScore.semanticScore}/100`);
  console.log(`  Reasoning       : ${result.hybridScore.semanticDetails.reasoning}`);

  printSection('Optimized Bullets');
  for (const bullet of result.bullets) {
    console.log(`\n  [${bullet.index}] ${bullet.role} @ ${bullet.company}`);
    console.log(`  Confidence: ${bullet.confidenceLevel.toUpperCase()} (${(bullet.confidenceScore * 100).toFixed(0)}%)`);
    console.log(`  ORIGINAL : ${bullet.originalBullet}`);
    console.log(`  OPTIMIZED: ${bullet.optimizedBullet}`);
    console.log(`  WHY      : ${bullet.explanation}`);
    console.log(`  KEYWORDS : ${bullet.keywordsUsed.join(', ')}`);
  }

  printSection('General Advice');
  console.log(`  ${result.generalAdvice}`);

  printSection('Gaps Remaining');
  result.gapsRemaining.forEach(g => console.log(`  - ${g}`));

  printSection('Meta');
  console.log(`  Prompt Version : ${result.meta.promptVersion}`);
  console.log(`  Model          : ${result.meta.modelUsed}`);
  console.log(`  Generated At   : ${result.meta.generatedAt}`);

  printHeader('POC TEST COMPLETED');
}

main().catch(err => {
  console.error(`\n  TEST FAILED: ${err.message}\n`);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
