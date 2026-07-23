import 'dotenv/config';
import mongoose from 'mongoose';

import { seedOptimizationRuns } from './optimization/optimizationRuns.seed.js';
import { cleanupSeedUsers } from './helpers/cleanupSeedUsers.js';
import { seedUsers } from './helpers/seedUsers.js';
import { seedVeredProfessionalDNA } from './resume/veredProfessionalDNA.seed.js';
import { seedYuvalProfessionalDNA } from './resume/yuvalProfessionalDNA.seed.js';
import { seedAssignments } from './assignments/assignments.seed.js';

const MONGO_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27017/careerpilot';

async function runDatabaseSeed(): Promise<void> {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('[seed] Connected to MongoDB');

    await cleanupSeedUsers();

    const users = await seedUsers();

    await seedVeredProfessionalDNA(users);
    await seedYuvalProfessionalDNA(users);
    await seedOptimizationRuns(users);
    await seedAssignments(users);

    console.log('[seed] Database seeding completed');

    for (const user of Object.values(users)) {
      console.log(`[seed] Created user: ${user.email}`);
    }
  } catch (error) {
    console.error('[seed] Database seeding failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('[seed] MongoDB connection closed');
  }
}

void runDatabaseSeed();