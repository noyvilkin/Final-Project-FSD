/**
 * ensureIndexes.ts
 *
 * Run this script to create/sync all Mongoose-defined indexes in MongoDB.
 * Useful after deploying schema changes or for fresh database setups.
 *
 * Usage:
 *   npx tsx src/scripts/ensureIndexes.ts
 *
 * Set MONGODB_URI (or MONGO_URI) in the environment or .env file.
 */
import 'dotenv/config';
import mongoose from 'mongoose';

// Import all models so their schemas (and index definitions) are registered
import { User } from '../features/user/models/user.model.js';
import { InterviewInsights } from '../features/interview/models/interviewInsights.model.js';
import { ProfessionalDNA } from '../features/resume/models/professionalDNA.model.js';
import { OptimizationRun } from '../features/resume/models/optimizationRun.model.js';
import { AssignmentFeedback } from '../features/assignment/models/assignmentFeedback.model.js';
import { ProfileAnalysis } from '../features/profile-analysis/models/profileAnalysis.model.js';

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/careerpilot';

interface ModelEntry {
  name: string;
  model: mongoose.Model<any>;
}

const models: ModelEntry[] = [
  { name: 'User', model: User },
  { name: 'InterviewInsights', model: InterviewInsights },
  { name: 'ProfessionalDNA', model: ProfessionalDNA },
  { name: 'OptimizationRun', model: OptimizationRun },
  { name: 'AssignmentFeedback', model: AssignmentFeedback },
  { name: 'ProfileAnalysis', model: ProfileAnalysis },
];

async function ensureIndexes(): Promise<void> {
  console.log(`Connecting to MongoDB: ${MONGO_URI.replace(/\/\/.*@/, '//***@')}`);
  await mongoose.connect(MONGO_URI);
  console.log('Connected.\n');

  for (const { name, model } of models) {
    try {
      console.log(`Syncing indexes for ${name}...`);
      await model.syncIndexes();

      const indexes = await model.collection.indexes();
      console.log(`  ${indexes.length} index(es):`);
      for (const idx of indexes) {
        const fields = Object.entries(idx.key)
          .map(([k, v]) => `${k}:${v}`)
          .join(', ');
        const flags = [
          idx.unique ? 'unique' : '',
          idx.sparse ? 'sparse' : '',
          idx.textIndexVersion ? 'text' : '',
        ]
          .filter(Boolean)
          .join(', ');
        console.log(`    { ${fields} }${flags ? ` (${flags})` : ''}`);
      }
      console.log();
    } catch (err) {
      console.error(`  ERROR syncing ${name}:`, err);
    }
  }

  await mongoose.disconnect();
  console.log('Done. Disconnected.');
}

ensureIndexes().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
