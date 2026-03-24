/**
 * Standalone POC test for the Resume Optimization pipeline.
 *
 * Run:  npx tsx src/features/resume/POC/poc-resume-optimization-test.ts
 *   or: npm run poc:resume
 *
 * No database or server required — exercises all three synchronous
 * services (ingestion, extraction, alignment) against sample data.
 */

import { JdIngestionService } from '../services/jdIngestionService.js';
import { KeywordExtractor } from '../services/keywordExtractor.js';
import { EntityAlignmentService } from '../services/entityAlignmentService.js';
import type { ISkill } from '../types/professionalDNA.types.js';

// ── Formatting helpers ────────────────────────────────────────────

function printHeader(text: string, char = '=') {
  const line = char.repeat(60);
  console.log(`\n${line}`);
  console.log(text.padStart((line.length + text.length) / 2));
  console.log(line);
}

function printSection(title: string) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(title);
  console.log('─'.repeat(60));
}

// ── Sample JD (HTML with boilerplate noise) ───────────────────────

const SAMPLE_JD_HTML = `
<html>
<body>
  <h1>Senior Full-Stack Engineer</h1>
  <h2>About the Role</h2>
  <p>We are looking for a <strong>Senior Full-Stack Engineer</strong> to join our
  growing engineering team. You will design, build, and maintain scalable web
  applications using modern technologies.</p>

  <h2>Requirements</h2>
  <ul>
    <li>5+ years of professional software development experience</li>
    <li>Strong proficiency in <b>TypeScript</b> and <b>JavaScript</b></li>
    <li>Production experience with <b>React</b> or <b>Angular</b> on the frontend</li>
    <li>Backend experience with <b>Node.js</b> (Express or NestJS)</li>
    <li>Solid experience with <b>MongoDB</b> and <b>PostgreSQL</b></li>
    <li>Hands-on experience with <b>Docker</b> and <b>Kubernetes</b></li>
    <li>Experience with <b>AWS</b> services (EC2, S3, Lambda, ECS)</li>
    <li>Familiarity with <b>CI/CD</b> pipelines (GitHub Actions or Jenkins)</li>
    <li>Understanding of <b>REST API</b> design and <b>GraphQL</b></li>
    <li>Experience with <b>Redis</b> for caching</li>
    <li>Familiarity with <b>Agile</b> / <b>Scrum</b> methodologies</li>
  </ul>

  <h2>Nice to Have</h2>
  <ul>
    <li><b>AWS Certified Solutions Architect</b></li>
    <li>Experience with <b>Terraform</b> for infrastructure as code</li>
    <li>Familiarity with <b>Kafka</b> or <b>RabbitMQ</b> message brokers</li>
    <li>Knowledge of <b>Machine Learning</b> concepts</li>
    <li>Experience with <b>TDD</b> and <b>Jest</b> testing</li>
  </ul>

  <h2>Tech Stack</h2>
  <p>React, Node.js, TypeScript, MongoDB, PostgreSQL, Docker, Kubernetes,
  AWS, Redis, GitHub Actions, Terraform, Datadog, Grafana</p>

  <h2>What We Offer</h2>
  <p>Competitive salary range: $150,000 - $200,000. Flexible remote work.
  Visit our careers page at https://example.com/careers for more info.
  Follow us on LinkedIn for updates.</p>

  <footer>
    <p>We are an Equal Opportunity Employer. All qualified applicants will receive
    consideration for employment without regard to race, color, religion, sex,
    national origin, disability, or veteran status.</p>
    <p>Click here to apply: https://jobs.example.com/apply/12345</p>
  </footer>
</body>
</html>
`;

// ── Mock Professional DNA (user's current skills) ─────────────────

const MOCK_USER_SKILLS: ISkill[] = [
  { name: 'TypeScript',   category: 'technical', proficiencyLevel: 'advanced',     yearsOfExperience: 4 },
  { name: 'JavaScript',   category: 'technical', proficiencyLevel: 'expert',       yearsOfExperience: 6 },
  { name: 'React',        category: 'technical', proficiencyLevel: 'advanced',     yearsOfExperience: 4 },
  { name: 'Node.js',      category: 'technical', proficiencyLevel: 'advanced',     yearsOfExperience: 5 },
  { name: 'Express',      category: 'technical', proficiencyLevel: 'advanced',     yearsOfExperience: 5 },
  { name: 'MongoDB',      category: 'technical', proficiencyLevel: 'advanced',     yearsOfExperience: 3 },
  { name: 'Docker',       category: 'tool',      proficiencyLevel: 'intermediate', yearsOfExperience: 2 },
  { name: 'Git',          category: 'tool',      proficiencyLevel: 'expert',       yearsOfExperience: 6 },
  { name: 'Python',       category: 'technical', proficiencyLevel: 'intermediate', yearsOfExperience: 2 },
  { name: 'REST API',     category: 'technical', proficiencyLevel: 'advanced',     yearsOfExperience: 5 },
  { name: 'Tailwind CSS', category: 'technical', proficiencyLevel: 'advanced',     yearsOfExperience: 2 },
  { name: 'Jest',         category: 'technical', proficiencyLevel: 'intermediate', yearsOfExperience: 2 },
  { name: 'Agile',        category: 'soft',      proficiencyLevel: 'advanced',     yearsOfExperience: 4 },
];

// ── Test runner ───────────────────────────────────────────────────

function runTest(): void {
  printHeader('Resume Optimization POC Test');
  console.log('Testing all pipeline stages against sample data\n');

  // ── Stage 1: JD Ingestion & Normalization ───────────────────────

  printSection('STAGE 1: JD Ingestion & Normalization');

  const normalized = JdIngestionService.fromText(SAMPLE_JD_HTML);

  console.log(`Original length : ${normalized.metrics.originalLength} chars`);
  console.log(`Cleaned length  : ${normalized.metrics.cleanedLength} chars`);
  console.log(`Reduction       : ${normalized.metrics.reductionPercent}%`);
  console.log(`Stripped HTML   : ${normalized.metrics.strippedHtml}`);
  console.log(`Stripped EEO    : ${normalized.metrics.strippedBoilerplate}`);
  console.log(`\nCleaned text preview (first 300 chars):`);
  console.log(`"${normalized.cleanText.slice(0, 300)}..."`);

  // ── Stage 2: Keyword Extraction ─────────────────────────────────

  printSection('STAGE 2: Keyword Extraction');

  const keywords = KeywordExtractor.extract(normalized.cleanText);

  console.log(`Total keywords found: ${keywords.keywords.length}\n`);

  console.log('Hard Skills:');
  keywords.hardSkills.forEach(s => console.log(`  - ${s}`));

  console.log('\nTools:');
  keywords.tools.forEach(t => console.log(`  - ${t}`));

  console.log('\nCertifications:');
  keywords.certifications.forEach(c => console.log(`  - ${c}`));

  console.log('\nMethodologies:');
  keywords.methodologies.forEach(m => console.log(`  - ${m}`));

  console.log('\nTop 10 by frequency:');
  keywords.keywords.slice(0, 10).forEach((kw, i) =>
    console.log(`  ${i + 1}. ${kw.term} (${kw.category}) x${kw.frequency}`)
  );

  // ── Stage 3: Entity Alignment ───────────────────────────────────

  printSection('STAGE 3: Entity Alignment');

  console.log(`User skills (${MOCK_USER_SKILLS.length}):`);
  MOCK_USER_SKILLS.forEach(s =>
    console.log(`  - ${s.name} [${s.proficiencyLevel}, ${s.yearsOfExperience ?? '?'}y]`)
  );

  const alignment = EntityAlignmentService.align(keywords, MOCK_USER_SKILLS);

  console.log(`\nRelevance Score: ${alignment.relevanceScore}%`);
  console.log(relevanceBar(alignment.relevanceScore));

  console.log(`\nMatching Skills (${alignment.matchingSkills.length}):`);
  alignment.matchingSkills.forEach(s => console.log(`  ✓ ${s}`));

  console.log(`\nMissing Skills (${alignment.missingSkills.length}):`);
  alignment.missingSkills.forEach(s => console.log(`  ✗ ${s}`));

  console.log(`\nExtra Skills — user has but JD doesn't require (${alignment.extraSkills.length}):`);
  alignment.extraSkills.forEach(s => console.log(`  ○ ${s}`));

  printSection('Category Breakdown');

  const { categoryBreakdown: cb } = alignment;

  console.log('Hard Skills:');
  console.log(`  Matched : ${cb.hardSkills.matched.join(', ') || '(none)'}`);
  console.log(`  Missing : ${cb.hardSkills.missing.join(', ') || '(none)'}`);

  console.log('Tools:');
  console.log(`  Matched : ${cb.tools.matched.join(', ') || '(none)'}`);
  console.log(`  Missing : ${cb.tools.missing.join(', ') || '(none)'}`);

  console.log('Certifications:');
  console.log(`  Matched : ${cb.certifications.matched.join(', ') || '(none)'}`);
  console.log(`  Missing : ${cb.certifications.missing.join(', ') || '(none)'}`);

  // ── Stage 4: Assembled Payload Preview ──────────────────────────

  printSection('STAGE 4: Payload Shape (what gets sent to AI Gateway)');

  const payload = {
    normalizedJD: {
      cleanText:    `[${normalized.cleanText.length} chars]`,
      originalText: `[${normalized.originalText.length} chars]`,
      metrics:      normalized.metrics,
    },
    extractedKeywords: {
      totalKeywords:  keywords.keywords.length,
      hardSkills:     keywords.hardSkills,
      tools:          keywords.tools,
      certifications: keywords.certifications,
      methodologies:  keywords.methodologies,
    },
    professionalDNA: {
      userId:     'mock-user-id',
      skillNames: MOCK_USER_SKILLS.map(s => s.name),
      skillCount: MOCK_USER_SKILLS.length,
    },
    alignment: {
      relevanceScore: alignment.relevanceScore,
      matchingSkills: alignment.matchingSkills,
      missingSkills:  alignment.missingSkills,
      extraSkills:    alignment.extraSkills,
    },
    meta: {
      generatedAt: new Date().toISOString(),
      version:     '1.0.0',
    },
  };

  console.log(JSON.stringify(payload, null, 2));

  // ── Summary ─────────────────────────────────────────────────────

  printHeader('POC TEST COMPLETED', '=');
  console.log(`\n  Normalization   : ${normalized.metrics.reductionPercent}% noise removed`);
  console.log(`  Keywords found  : ${keywords.keywords.length}`);
  console.log(`  Relevance score : ${alignment.relevanceScore}%`);
  console.log(`  Matched         : ${alignment.matchingSkills.length} skills`);
  console.log(`  Gaps            : ${alignment.missingSkills.length} skills`);
  console.log(`\n  All stages passed.\n`);
}

function relevanceBar(score: number): string {
  const filled = Math.round(score / 5);
  const empty  = 20 - filled;
  return `  [${'█'.repeat(filled)}${'░'.repeat(empty)}] ${score}%`;
}

// ── Run ───────────────────────────────────────────────────────────

try {
  runTest();
} catch (error) {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`\n  TEST FAILED: ${msg}`);
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
}
