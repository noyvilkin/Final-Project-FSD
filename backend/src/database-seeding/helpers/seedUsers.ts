import { AuthPasswordService } from '../../common/auth/password.service.js';

import { User } from '../../features/user/models/user.model.js';
import { seedUsersConfig } from '../seed.config.js';

import type {
  SeedUserConfig,
  SeedUsersMap,
} from '../seed.types.js';

async function createSeedUser(config: SeedUserConfig) {
  const passwordHash =
  await AuthPasswordService.hashPassword(config.password);

  return User.create({
    email: config.email,
    passwordHash,
    authProviders: ['password'],
    profile: config.profile,
    isActive: true,
  });
}

export async function seedUsers(): Promise<SeedUsersMap> {
  const users = {} as SeedUsersMap;

  for (const config of seedUsersConfig) {
    const user = await createSeedUser(config);
    users[config.key] = user;

    console.log(`[seed] User created: ${config.email}`);
  }

  return users;
}