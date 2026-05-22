import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FEATURE_DIR = resolve(__dirname, '..');
const REPORTS_DIR = resolve(FEATURE_DIR, '..', '..', '..', 'reports', 'assignment-audit');

function normalize(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value) {
  return normalize(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !['the', 'and', 'with', 'for', 'from', 'that', 'this', 'are', 'was', 'were', 'use', 'using', 'implement', 'provide', 'include', 'build', 'create', 'must', 'should', 'into', 'via', 'need'].includes(token));
}

function listRunDirs() {
  if (!existsSync(REPORTS_DIR)) {
    return [];
  }

  return readdirSync(REPORTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(REPORTS_DIR, entry.name))
    .sort();
}

function resolveRunDir() {
  const argIndex = process.argv.findIndex((arg) => arg === '--run-dir');
  if (argIndex !== -1 && process.argv[argIndex + 1]) {
    return resolve(process.argv[argIndex + 1]);
  }

  const dirs = listRunDirs();
  if (dirs.length === 0) {
    throw new Error(`No audit runs found under ${REPORTS_DIR}`);
  }

  return dirs[dirs.length - 1];
}

function findRawReports(runDir) {
  const rawDir = join(runDir, 'raw');
  if (!existsSync(rawDir)) {
    throw new Error(`Raw report directory not found: ${rawDir}`);
  }

  return readdirSync(rawDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => join(rawDir, file));
}

function scoreDetection(report) {
  const expected = tokens(report.packageMeta.violation_description || report.packageMeta.violation_key || report.packageName);
  const actualText = [
    report.aiResult?.feedback?.functionalCorrectness?.missingFeatures?.join(' '),
    report.aiResult?.feedback?.overall?.summary,
    report.aiResult?.feedback?.codeQuality?.weaknesses?.join(' '),
    report.aiResult?.feedback?.bestPractices?.suggestions?.join(' ')
  ].filter(Boolean).join(' ');

  const actual = new Set(tokens(actualText));
  const overlap = expected.filter((token) => actual.has(token));
  const ratio = expected.length === 0 ? 0 : overlap.length / expected.length;

  return {
    detected: ratio >= 0.12 || normalize(actualText).includes(normalize(report.packageMeta.violation_key || '')),
    overlap,
    ratio,
  };
}

function scoreFeedbackBalance(report) {
  const strengths = report.aiResult?.feedback?.codeQuality?.strengths?.length ?? 0;
  const weaknesses = report.aiResult?.feedback?.codeQuality?.weaknesses?.length ?? 0;
  const missingFeatures = report.aiResult?.feedback?.functionalCorrectness?.missingFeatures?.length ?? 0;
  const suggestions = report.aiResult?.feedback?.bestPractices?.suggestions?.length ?? 0;

  return strengths > 0 && weaknesses > 0 && missingFeatures > 0 && suggestions > 0;
}

function scoreNoiseReduction(report) {
  return report.checks?.noIgnoredPathsInScan === true && Array.isArray(report.zipScanResult?.sourceFiles);
}

function toMarkdown(summary) {
  const lines = [];
  lines.push('# Assignment Audit Score Report');
  lines.push('');
  lines.push(`- Run ID: ${summary.runId}`);
  lines.push(`- Created At: ${summary.createdAt}`);
  lines.push(`- Packages: ${summary.totals.packages}`);
  lines.push(`- Detection Rate: ${(summary.metrics.detectionRate * 100).toFixed(0)}%`);
  lines.push(`- Feedback Accuracy: ${(summary.metrics.feedbackAccuracy * 100).toFixed(0)}%`);
  lines.push(`- Noise Reduction: ${(summary.metrics.noiseReductionRate * 100).toFixed(0)}%`);
  lines.push('');
  lines.push('| Package | Expected Violation | Detected | Detection Ratio | Noise Clean | Feedback Balanced |');
  lines.push('|---|---|---:|---:|---:|---:|');

  for (const item of summary.packages) {
    lines.push(`| ${item.packageName} | ${item.expectedViolation} | ${item.detected ? 'Yes' : 'No'} | ${(item.detectionRatio * 100).toFixed(0)}% | ${item.noiseClean ? 'Yes' : 'No'} | ${item.feedbackBalanced ? 'Yes' : 'No'} |`);
  }

  lines.push('');
  lines.push('## Notes');
  lines.push('- Detection uses token overlap between the package metadata violation description/key and the AI feedback text.');
  lines.push('- Noise reduction is considered successful only when the scan contains no ignored paths.');

  return lines.join('\n');
}

function main() {
  const runDir = resolveRunDir();
  const rawReports = findRawReports(runDir).map((filePath) => JSON.parse(readFileSync(filePath, 'utf8')));

  if (rawReports.length === 0) {
    throw new Error(`No raw package reports found under ${join(runDir, 'raw')}`);
  }

  const packages = rawReports.map((report) => {
    const detection = scoreDetection(report);
    const noiseClean = scoreNoiseReduction(report);
    const feedbackBalanced = scoreFeedbackBalance(report);

    return {
      packageName: report.packageName,
      expectedViolation: report.packageMeta?.violation_description || report.packageMeta?.violation_key || 'unknown',
      detected: detection.detected,
      detectionRatio: detection.ratio,
      overlapTokens: detection.overlap,
      noiseClean,
      feedbackBalanced,
      aiMissingFeatures: report.aiResult?.feedback?.functionalCorrectness?.missingFeatures || [],
      aiSummary: report.aiResult?.feedback?.overall?.summary || '',
    };
  });

  const totals = {
    packages: packages.length,
    detected: packages.filter((item) => item.detected).length,
    noiseClean: packages.filter((item) => item.noiseClean).length,
    feedbackBalanced: packages.filter((item) => item.feedbackBalanced).length,
  };

  const metrics = {
    detectionRate: totals.detected / totals.packages,
    noiseReductionRate: totals.noiseClean / totals.packages,
    feedbackAccuracy: totals.feedbackBalanced / totals.packages,
  };

  const summary = {
    runId: basename(runDir),
    createdAt: new Date().toISOString(),
    runDir,
    totals,
    metrics,
    packages,
  };

  writeFileSync(join(runDir, 'summary.json'), JSON.stringify(summary, null, 2));
  writeFileSync(join(runDir, 'summary.md'), toMarkdown(summary));

  console.log(`Score report written to ${runDir}`);
  console.log(`Detection Rate: ${(metrics.detectionRate * 100).toFixed(0)}%`);
  console.log(`Feedback Accuracy: ${(metrics.feedbackAccuracy * 100).toFixed(0)}%`);
  console.log(`Noise Reduction: ${(metrics.noiseReductionRate * 100).toFixed(0)}%`);
}

function basename(path) {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

main();
