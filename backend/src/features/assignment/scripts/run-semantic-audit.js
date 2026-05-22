import 'dotenv/config';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { ZipProcessor } from '../../../common/utils/zipProcessor.js';
import { AssignmentAnalysisService } from '../services/assignmentAnalysisService.js';
import { AIAnalysisService } from '../services/aiAnalysisService.js';
import { AssignmentFeedback } from '../models/assignmentFeedback.model.js';
import { PdfProcessor } from '../../../common/utils/pdfProcessor.js';
import { connectToDatabase } from '../../../common/services/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FEATURE_DIR = resolve(__dirname, '..');
const FIXTURES_DIR = resolve(FEATURE_DIR, '__tests__', 'fixtures', 'faulty-packages');
const REPORTS_DIR = resolve(FEATURE_DIR, '..', '..', '..', 'reports', 'assignment-audit');
const CANONICAL_REQUIREMENTS_TEXT = [
  'Hard Requirements:',
  '- Use Node.js and Express to implement a REST API',
  '- Use PostgreSQL as the primary datastore',
  '- Implement authentication via JWT',
  '- Include unit tests for core endpoints',
  '- Provide a health endpoint at GET /health returning 200',
].join('\n');

function nowStamp() {
  const d = new Date();
  return d.toISOString().replace(/[:.]/g, '-');
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function listPackageDirs() {
  return readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(FIXTURES_DIR, entry.name));
}

function getPackageZipPath(packageDir) {
  return join(packageDir, `${basename(packageDir)}.zip`);
}

function basename(path) {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

function zipDirectory(sourceDir, destinationZip) {
  const result = spawnSync(
    'powershell',
    ['-NoProfile', '-Command', `Compress-Archive -Path "${sourceDir}\\*" -DestinationPath "${destinationZip}" -Force`],
    { encoding: 'utf8' }
  );

  if (result.status !== 0) {
    throw new Error(`Failed to create zip for ${sourceDir}: ${result.stderr || result.stdout}`);
  }
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function normalizeText(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeRequirements(text) {
  const normalized = normalizeText(text);
  const tokens = ['express', 'postgresql', 'jwt', 'unit tests', 'health', 'rest api'];
  const hitCount = tokens.filter((token) => normalized.includes(token)).length;
  return normalized.length > 80 && hitCount >= 3;
}

function isIgnoredPath(pathValue) {
  return /(^|[\\/])(node_modules|dist|build|coverage|vendor|\.git)([\\/]|$)/i.test(pathValue);
}

async function extractRequirementsText(filePath) {
  const buffer = readFileSync(filePath);
  const maybePdf = buffer.subarray(0, 4).toString('utf8') === '%PDF';

  if (maybePdf) {
    const extracted = await PdfProcessor.extractTextFromPdf(buffer);
    if (extracted.success && looksLikeRequirements(extracted.normalizedText)) {
      return extracted.normalizedText;
    }
  }

  const plainText = normalizeText(buffer.toString('utf8'));
  if (looksLikeRequirements(plainText)) {
    return plainText;
  }

  return CANONICAL_REQUIREMENTS_TEXT;
}

async function ensureDatabase() {
  if (process.env.MONGODB_URI) {
    await connectToDatabase();
    return null;
  }

  const memoryServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = memoryServer.getUri('assignment-audit');
  await connectToDatabase();
  return memoryServer;
}

async function validateZipFiltering() {
  const tempRoot = mkdtempSync(join(tmpdir(), 'assignment-audit-'));
  const zipPath = join(tempRoot, 'noise-check.zip');
  const sourceDir = join(tempRoot, 'noise-check');

  ensureDir(join(sourceDir, 'src'));
  ensureDir(join(sourceDir, 'node_modules', 'fake-dep'));
  ensureDir(join(sourceDir, 'dist'));

  writeFileSync(join(sourceDir, 'package.json'), JSON.stringify({ name: 'noise-check', version: '1.0.0' }, null, 2));
  writeFileSync(join(sourceDir, 'src', 'index.js'), "console.log('source file');\n");
  writeFileSync(join(sourceDir, 'node_modules', 'fake-dep', 'index.js'), "console.log('ignored dep');\n");
  writeFileSync(join(sourceDir, 'dist', 'bundle.js'), "console.log('ignored build');\n");

  zipDirectory(sourceDir, zipPath);

  const scanResult = await ZipProcessor.scanZipFile(readFileSync(zipPath));
  const ignoredPaths = scanResult.sourceFiles.filter((file) => isIgnoredPath(file.path));

  rmSync(tempRoot, { recursive: true, force: true });

  if (ignoredPaths.length > 0) {
    throw new Error(`Zip filtering regression detected: ${ignoredPaths.map((file) => file.path).join(', ')}`);
  }

  return {
    passed: true,
    scannedSourceFiles: scanResult.sourceFiles.map((file) => file.path),
    totalFiles: scanResult.totalFiles,
  };
}

async function runPackageAudit(packageDir, runDir) {
  const packageName = basename(packageDir);
  const packageMeta = readJson(join(packageDir, 'metadata.json'));
  const requirementsPath = join(packageDir, 'assignment.pdf');
  const solutionDir = join(packageDir, 'solution');
  const zipPath = getPackageZipPath(packageDir);

  zipDirectory(solutionDir, zipPath);

  const zipBuffer = readFileSync(zipPath);
  const zipScanResult = await ZipProcessor.scanZipFile(zipBuffer);
  const sourceFiles = zipScanResult.sourceFiles;
  const ignoredPaths = sourceFiles.filter((file) => isIgnoredPath(file.path)).map((file) => file.path);

  if (ignoredPaths.length > 0) {
    throw new Error(`${packageName}: ignored paths leaked into scan: ${ignoredPaths.join(', ')}`);
  }

  const requirementsText = await extractRequirementsText(requirementsPath);
  const normalizedRequirements = requirementsText.trim();

  const analysisResult = await AssignmentAnalysisService.analyzeAssignment({
    zipScanResult,
    requirementsText: normalizedRequirements,
  });

  const assignment = await AssignmentFeedback.create({
    userId: new mongoose.Types.ObjectId(),
    requirementsFileKey: join(packageName, 'assignment.pdf'),
    solutionFileKey: zipPath,
    status: 'processing',
    metadata: {
      ...analysisResult.metadata,
      requirements: normalizedRequirements,
      extractedRequirements: normalizedRequirements,
      sourceCodeContent: sourceFiles.reduce((acc, file) => {
        acc[file.path] = file.content;
        return acc;
      }, {}),
      totalFiles: sourceFiles.length,
      totalLines: sourceFiles.reduce((sum, file) => sum + file.content.split(/\r?\n/).length, 0),
      detectedLanguage: analysisResult.metadata.detectedLanguage || zipScanResult.detectedLanguage || undefined,
      detectedFrameworks: analysisResult.metadata.scanMetadata?.frameworks || zipScanResult.metadata.frameworks,
    },
  });

  process.env.ASSIGNMENT_AI_DRY_RUN = 'true';
  const aiResult = await AIAnalysisService.analyzeAssignmentWithAI(assignment._id.toString());
  await AIAnalysisService.saveAnalysisResults(assignment._id.toString(), aiResult);

  const reloaded = await AssignmentFeedback.findById(assignment._id).lean();

  const report = {
    packageName,
    packageMeta,
    requirementsText,
    zipPath,
    zipScanResult: {
      isValid: zipScanResult.isValid,
      totalFiles: zipScanResult.totalFiles,
      sourceFiles: zipScanResult.sourceFiles.map((file) => ({ path: file.path, language: file.language, size: file.size })),
      detectedLanguage: zipScanResult.detectedLanguage,
      projectScope: zipScanResult.projectScope,
      totalSourceSize: zipScanResult.totalSourceSize,
      errors: zipScanResult.errors,
      metadata: zipScanResult.metadata,
    },
    analysisResult: {
      success: analysisResult.success,
      metadata: analysisResult.metadata,
      sourceCodeSummary: analysisResult.sourceCodeSummary,
      errors: analysisResult.errors,
      processingTime: analysisResult.processingTime,
    },
    aiResult,
    persistedAssignment: {
      status: reloaded?.status,
      aiFeedback: reloaded?.aiFeedback,
      aiAnalysisCompletedAt: reloaded?.aiAnalysisCompletedAt,
      processingErrors: reloaded?.processingErrors,
    },
    checks: {
      noIgnoredPathsInScan: ignoredPaths.length === 0,
      dryRunMode: process.env.ASSIGNMENT_AI_DRY_RUN === 'true',
      aiSucceeded: aiResult.success,
      requirementsPersisted: !!reloaded?.metadata?.requirements,
    },
  };

  writeFileSync(join(runDir, `${packageName}.json`), JSON.stringify(report, null, 2));

  return report;
}

async function main() {
  const runId = nowStamp();
  const runDir = join(REPORTS_DIR, runId, 'raw');
  ensureDir(runDir);

  const memoryServer = await ensureDatabase();

  try {
    const preflight = await validateZipFiltering();
    writeFileSync(join(REPORTS_DIR, runId, 'preflight.json'), JSON.stringify(preflight, null, 2));

    const packageDirs = listPackageDirs();
    const reports = [];

    for (const packageDir of packageDirs) {
      const report = await runPackageAudit(packageDir, runDir);
      reports.push(report);
      console.log(`Audited ${report.packageName}: ${report.aiResult.feedback?.functionalCorrectness.missingFeatures.length ?? 0} missing feature(s)`);
    }

    const manifest = {
      runId,
      createdAt: new Date().toISOString(),
      preflight,
      packages: reports.map((report) => ({
        packageName: report.packageName,
        zipPath: report.zipPath,
        meta: report.packageMeta,
      })),
    };

    writeFileSync(join(REPORTS_DIR, runId, 'manifest.json'), JSON.stringify(manifest, null, 2));

    console.log(`Audit run completed: ${join(REPORTS_DIR, runId)}`);
  } finally {
    await mongoose.disconnect().catch(() => {});
    if (memoryServer) {
      await memoryServer.stop();
    }
  }
}

await main();
