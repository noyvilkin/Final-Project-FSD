import mongoose, { Document, Schema, Types } from 'mongoose';
import type {
  ISkill,
  IExperience,
  IEducation,
  IProfileSummary,
} from '../types/professionalDNA.types.js';

/**
 * Structured Professional DNA captured at optimization time. The docx is
 * composed from this frozen snapshot so an accepted rewrite's experience
 * `index` always maps to the exact same job entry that was optimized,
 * even if the user later re-uploads a different resume.
 */
export interface ICvSnapshot {
  candidateName?: string;
  candidateEmail?: string;
  candidatePhone?: string;
  candidateLocation?: string;
  candidateLinks?: string[];
  aboutMe?: string;
  profileSummary?: IProfileSummary;
  skills: ISkill[];
  experience: IExperience[];
  education: IEducation[];
}

export interface IOptimizationRun extends Document {
  userId: Types.ObjectId;
  jobDescriptionText: string;

  /** Stored dashboard snapshot (bullets, scores, advice) */
  dashboardData: Record<string, unknown>;

  /** The user's original resume text — base for reconstruction */
  originalResumeText: string;

  /**
   * Frozen structured DNA (as it was when this run was optimized) used to
   * compose the downloadable CV. Optional for runs created before snapshots
   * were introduced.
   */
  dnaSnapshot?: ICvSnapshot;

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
    dnaSnapshot: { type: Schema.Types.Mixed },

    artifactKey:  { type: String },
    versionTag:   { type: String, required: true },
    downloadUrl:  { type: String },
  },
  { timestamps: true }
);

OptimizationRunSchema.index({ userId: 1, createdAt: -1 });

// Text index on job description for potential search functionality
OptimizationRunSchema.index({ jobDescriptionText: 'text' });

export const OptimizationRun = mongoose.model<IOptimizationRun>(
  'OptimizationRun',
  OptimizationRunSchema
);
