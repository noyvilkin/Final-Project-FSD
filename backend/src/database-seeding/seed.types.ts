import type { HydratedDocument } from 'mongoose';
import type { IUser } from '../features/user/models/user.model.js';

export type SeedUserKey = 'vered' | 'yuval';

export interface SeedUserConfig {
  key: SeedUserKey;
  email: string;
  password: string;
  profile: {
    firstName: string;
    lastName: string;
  };
}

export type SeedUserDocument = HydratedDocument<IUser>;

export type SeedUsersMap = Record<SeedUserKey, SeedUserDocument>;