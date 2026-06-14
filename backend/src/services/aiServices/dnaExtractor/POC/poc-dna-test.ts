// POC: end-to-end DNA extraction from a sample resume.
// Run with: `npm run poc:dna` (requires GEMINI_API_KEY in backend/.env).

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GeminiClient } from '../../../../common/services/geminiClient.js';
import { extractDna } from '../index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

async function main(): Promise<void> {
  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set. Add it to backend/.env and try again.');
    process.exit(1);
  }

  const fixturePath = resolve(__dirname, 'fixtures', 'sample-resume.txt');
  const resumeText  = readFileSync(fixturePath, 'utf-8');

  console.log(`[poc:dna] Loaded sample resume (${resumeText.length} chars)`);
  console.log('[poc:dna] Calling Gemini via the DNA Extractor...\n');

  const client = new GeminiClient({ apiKey });

  const started = Date.now();
  const result  = await extractDna({
    client,
    resumeText,
    metadata: {
      targetRole:     'Senior Full Stack Developer',
      currentRole:    'Full Stack Developer',
      experienceHint: '4 years',
    },
  });
  const elapsed = Date.now() - started;

  console.log(JSON.stringify(result, null, 2));
  console.log('\n---');
  console.log(`Skills:       ${result.skills.length}`);
  console.log(`Experience:   ${result.experience.length} entries`);
  console.log(`Education:    ${result.education.length} entries`);
  console.log(`Achievements: ${result.achievements.length}`);
  console.log(`Elapsed:      ${elapsed} ms`);
}

main().catch((err) => {
  console.error('[poc:dna] failed:', err);
  process.exit(1);
});
