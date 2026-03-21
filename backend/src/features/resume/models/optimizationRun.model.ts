import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IOptimizationRun extends Document {
  userId: Types.ObjectId;
  jobDescriptionText: string;

  /** Stored dashboard snapshot (bullets, scores, advice) */
  dashboardData: Record<string, unknown>;

  /** S3/MinIO key for the reconstructed CV file */
  artifactKey: string;

  /** Distinguishes multiple runs for the same JD */
  versionTag: string;

  /** Pre-built URL to download the CV blob */
  downloadUrl: string;

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

    artifactKey:  { type: String, required: true },
    versionTag:   { type: String, required: true },
    downloadUrl:  { type: String, required: true },
  },
  { timestamps: true }
);

OptimizationRunSchema.index({ userId: 1, createdAt: -1 });

export const OptimizationRun = mongoose.model<IOptimizationRun>(
  'OptimizationRun',
  OptimizationRunSchema
);
