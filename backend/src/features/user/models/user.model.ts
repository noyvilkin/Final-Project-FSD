import mongoose, { Document, Schema, Types } from 'mongoose';

interface IUserProfile {
  firstName?: string;
  lastName?:  string;
  phone?:     string;
  linkedIn?:  string;
}

export type AuthProvider = "password" | "google";

export interface IUser extends Document {
  email: string;
  passwordHash?: string;
  googleId?: string;
  authProviders: AuthProvider[];
  refreshTokenHash?: string;
  refreshTokenIssuedAt?: Date;
  profile: IUserProfile;
  latestResumeId?:        Types.ObjectId;
  latestProfessionalDNA?: Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserProfileSchema = new Schema<IUserProfile>({
  firstName: { type: String },
  lastName:  { type: String },
  phone:     { type: String },
  linkedIn:  { type: String },
}, { _id: false });

const UserSchema = new Schema<IUser>(
  {
    email:        { type: String, required: true, unique: true, lowercase: true, index: true },
    passwordHash: { type: String },
    googleId:     { type: String, unique: true, sparse: true, index: true },
    authProviders: {
      type: [String],
      enum: ["password", "google"],
      default: ["password"],
    },
    refreshTokenHash: { type: String },
    refreshTokenIssuedAt: { type: Date },
    profile:      { type: UserProfileSchema, default: {} },
    latestResumeId:        { type: Schema.Types.ObjectId, ref: 'Resume' },
    latestProfessionalDNA: { type: Schema.Types.ObjectId, ref: 'ProfessionalDNA' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', UserSchema);
