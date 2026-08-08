/**
 * Verifies that repeated PDF extraction in one process stays reliable, and that each
 * fixture's assignment.pdf still matches its editable requirements.txt source.
 *
 * This guards the defect that broke uploads in production: the previous extractor
 * (pdf-parse, bundling pdf.js 1.10.100) carried mutable state between calls and corrupted
 * roughly every third parse in a long-lived process — 14 failures in 40 sequential
 * extractions, throwing "bad XRef entry" on files that parse perfectly in isolation.
 * A PM2 server stays up for days, so uploads failed intermittently.
 *
 * It lives here rather than in the Jest suite because pdf.js ships ESM only and the suite
 * runs through ts-jest in CommonJS. PdfProcessor's own logic is unit tested with a mocked
 * renderer; this exercises the real one.
 *
 * Usage: npm run verify:pdf
 */

import fs from 'node:fs';
import path from 'node:path';

import { PdfProcessor } from '../../../common/utils/pdfProcessor.js';

const FIXTURE_ROOT = path.join(process.cwd(), 'src/features/assignment/tests/faulty-packages');
const ROUNDS = 5;

interface FixturePair {
  name: string;
  pdfPath: string;
  txtPath: string;
}

function fixturePairs(): FixturePair[] {
  if (!fs.existsSync(FIXTURE_ROOT)) return [];
  return fs
    .readdirSync(FIXTURE_ROOT)
    .filter((entry) => entry.startsWith('package-'))
    .map((entry) => ({
      name: entry,
      pdfPath: path.join(FIXTURE_ROOT, entry, 'assignment.pdf'),
      txtPath: path.join(FIXTURE_ROOT, entry, 'requirements.txt'),
    }))
    .filter((pair) => fs.existsSync(pair.pdfPath))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Significant tokens from the brief that should survive PDF extraction. */
function briefTokens(text: string): string[] {
  return text
    .replace(/[-•]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 2);
}

async function main(): Promise<void> {
  const fixtures = fixturePairs();
  if (fixtures.length === 0) {
    console.error(`No fixture PDFs found under ${FIXTURE_ROOT}`);
    process.exit(1);
  }

  console.log(`Extracting ${fixtures.length} PDFs x ${ROUNDS} rounds in a single process\n`);

  const failures: string[] = [];
  const textByFile = new Map<string, string>();
  let sequence = '';

  for (let round = 0; round < ROUNDS; round++) {
    for (const fixture of fixtures) {
      const result = await PdfProcessor.extractTextFromPdf(fs.readFileSync(fixture.pdfPath));

      if (!result.success) {
        sequence += 'X';
        failures.push(`${fixture.name} (round ${round}): ${result.errors.join('; ')}`);
        continue;
      }

      // Extraction must also be stable, not merely non-throwing: a rubric that changes
      // between rounds would silently change the grade for the same submission.
      const previous = textByFile.get(fixture.name);
      if (previous !== undefined && previous !== result.normalizedText) {
        sequence += '!';
        failures.push(`${fixture.name} (round ${round}): extracted text differs from the first round`);
        continue;
      }

      textByFile.set(fixture.name, result.normalizedText);
      sequence += '.';
    }
  }

  console.log(`  ${sequence}`);
  console.log('  legend: . ok, X failed, ! unstable output\n');

  if (failures.length > 0) {
    console.error(`FAILED: ${failures.length}/${sequence.length} extractions`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  console.log(`OK: ${sequence.length}/${sequence.length} extractions succeeded with stable output`);

  // Catch silent drift: requirements.txt is the editable source, assignment.pdf is what
  // the eval and product path grade against. If someone edits the txt and forgets
  // cupsfilter, the committed pair disagrees and fixtures become unreproducible.
  console.log('\nChecking requirements.txt ↔ assignment.pdf sync\n');
  const syncFailures: string[] = [];

  for (const fixture of fixtures) {
    if (!fs.existsSync(fixture.txtPath)) {
      syncFailures.push(`${fixture.name}: missing requirements.txt`);
      continue;
    }

    const extracted = (textByFile.get(fixture.name) || '').replace(/\s+/g, ' ').toLowerCase();
    const tokens = briefTokens(fs.readFileSync(fixture.txtPath, 'utf8'));
    const missing = tokens.filter((token) => !extracted.includes(token));

    if (missing.length > 0) {
      syncFailures.push(
        `${fixture.name}: PDF is missing ${missing.length}/${tokens.length} brief tokens` +
          ` (e.g. ${missing.slice(0, 6).join(', ')}) — regenerate with cupsfilter`
      );
      console.log(`  ${fixture.name.padEnd(20)} DRIFT`);
    } else {
      console.log(`  ${fixture.name.padEnd(20)} ok`);
    }
  }

  if (syncFailures.length > 0) {
    console.error(`\nFAILED: ${syncFailures.length} fixture(s) out of sync`);
    for (const failure of syncFailures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  console.log(`\nOK: all ${fixtures.length} briefs survive PDF extraction`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
