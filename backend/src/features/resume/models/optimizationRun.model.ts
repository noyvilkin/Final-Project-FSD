import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IOptimizationRun extends Document {
  userId: Types.ObjectId;
  jobDescriptionText: string;

  /** Stored dashboard snapshot (bullets, scores, advice) */
  dashboardData: Record<string, unknown>;

  /** The user's original resume text — base for reconstruction */
  originalResumeText: string;

  /** The user's original uploaded PDF — base for in-place overlay editing */
  originalResumePdf?: Buffer;

  /** S3/MinIO key for the finalized CV file (set on first download) */
  artifactKey?: string;

  /** Distinguishes multiple runs for the same JD */
  versionTag: string;

  /** Pre-built URL to download the CV blob (set on first download) */
  downloadUrl?: string;

  createdAt: Date;
  updatedAt: Date;
}

const OptimizationRunSchema = new Schema<IOptimizationRun>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    jobDescriptionText: { type: String, required: true },

    dashboardData: { type: Schema.Types.Mixed, required: true },

    originalResumeText: { type: String, required: true },
    originalResumePdf: { type: Buffer },

    artifactKey:  { type: String },
    versionTag:   { type: String, required: true },
    downloadUrl:  { type: String },
  },
  { timestamps: true }
);

OptimizationRunSchema.index({ userId: 1, createdAt: -1 });

export const OptimizationRun = mongoose.model<IOptimizationRun>(
  'OptimizationRun',
  OptimizationRunSchema
);
