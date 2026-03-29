import mongoose, { Document, Schema, Types } from "mongoose";

export interface IProfileAnalysis extends Document {
  userId: Types.ObjectId;
  candidateName?: string;
  candidateEmail?: string;
  rawResumeText?: string;
  profileSummary: {
    hasDegree: boolean;
    highestDegree?: string;
    fieldOfStudy?: string;
    institution?: string;
    gradeAverage?: number;
    totalYearsOfExperience?: number;
    topSkills: string[];
    recommendedCourses: string[];
  };
  analysisStatus: "pending" | "processing" | "completed" | "failed";
  createdAt: Date;
  updatedAt: Date;
}

const ProfileAnalysisSchema = new Schema<IProfileAnalysis>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    candidateName: { type: String },
    candidateEmail: { type: String },
    rawResumeText: { type: String },
    profileSummary: {
      hasDegree: { type: Boolean, default: false },
      highestDegree: { type: String },
      fieldOfStudy: { type: String },
      institution: { type: String },
      gradeAverage: { type: Number },
      totalYearsOfExperience: { type: Number },
      topSkills: { type: [String], default: [] },
      recommendedCourses: { type: [String], default: [] },
    },
    analysisStatus: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
    },
  },
  { timestamps: true }
);

ProfileAnalysisSchema.index({ userId: 1, updatedAt: -1 });

export const ProfileAnalysis = mongoose.model<IProfileAnalysis>(
  "ProfileAnalysis",
  ProfileAnalysisSchema
);