/**
 * Verifies that repeated PDF extraction in one process stays reliable.
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

function fixturePdfs(): string[] {
  if (!fs.existsSync(FIXTURE_ROOT)) return [];
  return fs
    .readdirSync(FIXTURE_ROOT)
    .filter((entry) => entry.startsWith('package-'))
    .map((entry) => path.join(FIXTURE_ROOT, entry, 'assignment.pdf'))
    .filter((file) => fs.existsSync(file))
    .sort();
}

async function main(): Promise<void> {
  const pdfs = fixturePdfs();
  if (pdfs.length === 0) {
    console.error(`No fixture PDFs found under ${FIXTURE_ROOT}`);
    process.exit(1);
  }

  console.log(`Extracting ${pdfs.length} PDFs x ${ROUNDS} rounds in a single process\n`);

  const failures: string[] = [];
  const textByFile = new Map<string, string>();
  let sequence = '';

  for (let round = 0; round < ROUNDS; round++) {
    for (const file of pdfs) {
      const name = path.basename(path.dirname(file));
      const result = await PdfProcessor.extractTextFromPdf(fs.readFileSync(file));

      if (!result.success) {
        sequence += 'X';
        failures.push(`${name} (round ${round}): ${result.errors.join('; ')}`);
        continue;
      }

      // Extraction must also be stable, not merely non-throwing: a rubric that changes
      // between rounds would silently change the grade for the same submission.
      const previous = textByFile.get(name);
      if (previous !== undefined && previous !== result.normalizedText) {
        sequence += '!';
        failures.push(`${name} (round ${round}): extracted text differs from the first round`);
        continue;
      }

      textByFile.set(name, result.normalizedText);
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
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
