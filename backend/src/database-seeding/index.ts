import 'dotenv/config';
import mongoose from 'mongoose';


import { cleanupSeedUsers } from './helpers/cleanupSeedUsers.js';
import { seedUsers } from './helpers/seedUsers.js';
import { seedVeredProfessionalDNA } from './resume/veredProfessionalDNA.seed.js';
import { seedYuvalProfessionalDNA } from './resume/yuvalProfessionalDNA.seed.js';

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

    console.log('[seed] Database seeding completed');
    console.log(`[seed] Created user: ${users.vered.email}`);
  } catch (error) {
    console.error('[seed] Database seeding failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('[seed] MongoDB connection closed');
  }
}

void runDatabaseSeed();