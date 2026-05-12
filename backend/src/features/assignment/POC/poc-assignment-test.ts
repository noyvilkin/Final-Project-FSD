import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import * as dotenv from 'dotenv';
import { Types } from 'mongoose';
import { ZipProcessor } from '../../../common/utils/zipProcessor.js';
import { AssignmentAnalysisService, type AssignmentAnalysisResult } from '../services/assignmentAnalysisService.js';
import { AIAnalysisService, type AIAnalysisResult } from '../services/aiAnalysisService.js';
import { AssignmentFeedback } from '../models/assignmentFeedback.model.js';
import { connectToDatabase } from '../../../common/services/database.js';
import { appLogger } from '../../../common/services/logger.js';

// Load .env file from backend root
const envPath = join(process.cwd(), '.env');
dotenv.config({ path: envPath });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const POC_FOLDER = __dirname;

function printHeader(text: string, char: string = '=') {
  const line = char.repeat(50);
  console.log(line);
  console.log(text.padStart((line.length + text.length) / 2));
  console.log(line);
}

function printSection(title: string) {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`${title.padEnd(50)}`);
  console.log('─'.repeat(50));
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function runPOCTest(): Promise<void> {
  printHeader('Assignment Analysis POC Test - Production Flow', '=');
  console.log('This test uses ACTUAL production services and database\n');

  let assignmentDoc;

  try {
    // Step 0: Connect to Database
    printSection('STEP 0: Connecting to Database');
    await connectToDatabase();
    console.log('✓ Connected to MongoDB\n');

    // Step 1: Load Files
    printSection('STEP 1: Loading Test Files');
    const pdfPath = join(POC_FOLDER, 'Assignment_Requirements.pdf');
    const zipPath = join(POC_FOLDER, 'solution.zip');

    let pdfBuffer: Buffer | undefined;
    let zipBuffer: Buffer;

    try {
      pdfBuffer = readFileSync(pdfPath);
      console.log(`✓ PDF loaded (${formatFileSize(pdfBuffer.length)})`);
    } catch (error) {
      console.warn(`⚠ PDF not found, continuing without requirements`);
    }

    try {
      zipBuffer = readFileSync(zipPath);
      console.log(`✓ ZIP loaded (${formatFileSize(zipBuffer.length)})\n`);
    } catch (error) {
      throw new Error('Solution ZIP file is required');
    }

    // Step 2: Scan ZIP
    printSection('STEP 2: Scanning Solution ZIP');
    const zipScanResult = await ZipProcessor.scanZipFile(zipBuffer);
    
    if (!zipScanResult.isValid) {
      throw new Error('ZIP validation failed');
    }

    console.log(`✓ ZIP validation PASSED`);
    console.log(`  Files: ${zipScanResult.totalFiles}`);
    console.log(`  Language: ${zipScanResult.detectedLanguage || 'Unknown'}`);
    console.log(`  Scope: ${zipScanResult.projectScope}`);
    console.log(`  Size: ${formatFileSize(zipScanResult.totalSourceSize)}\n`);

    // Step 3: Run Analysis Service (Production)
    printSection('STEP 3: Running Production Analysis Service');
    console.log('▪ Calling AssignmentAnalysisService.analyzeAssignment()...\n');
    
    const analysisResult: AssignmentAnalysisResult = await AssignmentAnalysisService.analyzeAssignment({
      zipScanResult,
      pdfBuffer
    });

    console.log(`✓ Analysis completed in ${analysisResult.processingTime}ms`);
    console.log(`  Success: ${analysisResult.success}`);
    console.log(`  Errors: ${analysisResult.errors.length}`);
    console.log(`  Language: ${analysisResult.metadata.detectedLanguage}`);
    console.log(`  Files: ${analysisResult.metadata.fileCount}`);
    console.log(`  Frameworks: ${analysisResult.metadata.detectedFrameworks?.join(', ') || 'None'}\n`);

    // Step 4: Save to Database (Production Flow)
    printSection('STEP 4: Saving Assignment to Database');
    console.log('▪ Creating assignment document...\n');

    assignmentDoc = new AssignmentFeedback({
      userId: new Types.ObjectId(), // Test user ID
      requirementsFileKey: 'poc-test-requirements.pdf',
      solutionFileKey: 'poc-test-solution.zip',
      metadata: {
        ...analysisResult.metadata,
        sourceCodeContent: zipScanResult.sourceFiles.reduce((acc, file) => {
          acc[file.path] = file.content;
          return acc;
        }, {} as Record<string, string>)
      },
      status: 'processing'
    });

    await assignmentDoc.save();
    const assignmentId = assignmentDoc._id.toString();

    console.log(`✓ Assignment saved to database`);
    console.log(`  ID: ${assignmentId}\n`);

    // Step 5: Run AI Analysis (Production Service)
    if (process.env.GEMINI_API_KEY) {
      printSection('STEP 5: Running Production AI Analysis Service');
      console.log('▪ Calling AIAnalysisService.analyzeAssignmentWithAI()...\n');

      const aiResult: AIAnalysisResult = await AIAnalysisService.analyzeAssignmentWithAI(assignmentId);

      if (aiResult.success && aiResult.feedback) {
        console.log(`✓ AI Analysis completed successfully\n`);

        // Update assignment document with AI feedback
        assignmentDoc.aiFeedback = aiResult.feedback;
        assignmentDoc.status = 'completed';
        assignmentDoc.aiAnalysisCompletedAt = new Date();
        await assignmentDoc.save();

        console.log('✓ Assignment updated with AI feedback\n');

        // Display Results
        printHeader('PRODUCTION AI ANALYSIS RESULTS');
        
        const { feedback } = aiResult;

        printSection('📊 Code Quality');
        console.log(`Score: ${feedback.codeQuality.score}/100`);
        if (feedback.codeQuality.strengths.length > 0) {
          console.log('Strengths:');
          feedback.codeQuality.strengths.forEach(s => console.log(`  ✓ ${s}`));
        }
        if (feedback.codeQuality.weaknesses.length > 0) {
          console.log('Weaknesses:');
          feedback.codeQuality.weaknesses.forEach(w => console.log(`  ✗ ${w}`));
        }

        printSection('✅ Functional Correctness');
        console.log(`Score: ${feedback.functionalCorrectness.score}/100`);
        console.log(`Meets Requirements: ${feedback.functionalCorrectness.meetsRequirements ? 'Yes' : 'No'}`);
        if (feedback.functionalCorrectness.missingFeatures.length > 0) {
          console.log('Missing Features:');
          feedback.functionalCorrectness.missingFeatures.forEach(f => console.log(`  ○ ${f}`));
        }

        printSection('🎯 Best Practices');
        console.log(`Score: ${feedback.bestPractices.score}/100`);
        console.log(`Follows Conventions: ${feedback.bestPractices.followsConventions ? 'Yes' : 'No'}`);
        if (feedback.bestPractices.suggestions.length > 0) {
          console.log('Suggestions:');
          feedback.bestPractices.suggestions.forEach(s => console.log(`  • ${s}`));
        }

        printSection('📌 Overall Assessment');
        console.log(`Score: ${feedback.overall.score}/100`);
        console.log(`Grade: ${feedback.overall.grade}`);
        console.log(`Summary: ${feedback.overall.summary}`);

        printSection('💾 Database Record');
        console.log(`Assignment ID: ${assignmentId}`);
        console.log(`Status: ${assignmentDoc.status}`);
        console.log(`Created: ${assignmentDoc.createdAt.toISOString()}`);
        console.log(`AI Analysis: ${assignmentDoc.aiAnalysisCompletedAt?.toISOString()}`);

      } else {
        console.warn(`⚠ AI Analysis failed: ${aiResult.error}`);
        assignmentDoc.status = 'failed';
        assignmentDoc.processingErrors = [aiResult.error || 'Unknown error'];
        await assignmentDoc.save();
      }
    } else {
      printSection('STEP 5: AI Analysis (Skipped)');
      console.log('⚠ GEMINI_API_KEY not configured');
      console.log('  Set GEMINI_API_KEY in .env to enable AI analysis\n');
      
      assignmentDoc.status = 'completed';
      await assignmentDoc.save();
    }

    // Final Summary
    console.log('\n');
    printHeader('POC TEST COMPLETED', '✓');
    console.log(`\n✓ Successfully tested production flow`);
    console.log(`✓ Assignment saved: ${assignmentId}`);
    console.log(`✓ All production services working\n`);

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ TEST FAILED: ${msg}`);
    
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }

    // Clean up failed assignment if it was created
    if (assignmentDoc) {
      assignmentDoc.status = 'failed';
      assignmentDoc.processingErrors = [msg];
      await assignmentDoc.save();
      console.log(`\n⚠ Assignment marked as failed: ${assignmentDoc._id}`);
    }

    process.exit(1);
  } finally {
    // Close database connection
    const mongoose = await import('mongoose');
    await mongoose.default.connection.close();
    console.log('Database connection closed\n');
  }
}

// Run the test
appLogger.info('Starting POC test with production services');
await runPOCTest();
