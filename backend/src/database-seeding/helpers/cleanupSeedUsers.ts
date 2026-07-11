import { User } from '../../features/user/models/user.model.js';
import { ProfessionalDNA } from '../../features/resume/models/professionalDNA.model.js';
import { seedUsersConfig } from '../seed.config.js';

export async function cleanupSeedUsers(): Promise<void> {
  const seedEmails = seedUsersConfig.map((user) => user.email);

  const existingUsers = await User.find({
    email: { $in: seedEmails },
  }).select('_id');

  const userIds = existingUsers.map((user) => user._id);

  if (userIds.length > 0) {
    await ProfessionalDNA.deleteMany({
      userId: { $in: userIds },
    });
  }

  const result = await User.deleteMany({
    email: { $in: seedEmails },
  });

  console.log(
    `[seed] Removed ${result.deletedCount} existing seed user(s)`
  );
}