import mongoose, { Document, Schema, Types } from 'mongoose';
import type {
  ISkill,
  IExperience,
  IEducation,
  IGapAnalysis,
  IRecommendation,
  IProfileSummary,
} from '../types/professionalDNA.types.js';

export interface IProfessionalDNA extends Document {
  userId: Types.ObjectId;
  resumeId?: Types.ObjectId;
  candidateName?: string;
  candidateEmail?: string;
  skills: ISkill[];
  experience: IExperience[];
  education: IEducation[];
  gapAnalysis?: IGapAnalysis;
  profileSummary?: IProfileSummary;
  rawResumeText?: string;
  analysisStatus: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

const SkillSchema = new Schema<ISkill>({
  name: { type: String, required: true },
  category: {
    type: String,
    enum: ['technical', 'soft', 'tool', 'language'],
    required: true,
  },
  proficiencyLevel: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced', 'expert'],
    required: true,
  },
  yearsOfExperience: { type: Number },
}, { _id: false });

const ExperienceSchema = new Schema<IExperience>({
  company:        { type: String, required: true },
  role:           { type: String, required: true },
  startDate:      { type: Date,   required: true },
  endDate:        { type: Date },
  isCurrent:      { type: Boolean, default: false },
  description:    { type: String },
  extractedSkills:{ type: [String], default: [] },
}, { _id: false });

const EducationSchema = new Schema<IEducation>({
  institution:  { type: String, required: true },
  degree:       { type: String, required: true },
  fieldOfStudy: { type: String, required: true },
  startDate:    { type: Date,   required: true },
  endDate:      { type: Date },
  gpa:          { type: Number, min: 0, max: 4 },
}, { _id: false });

const RecommendationSchema = new Schema<IRecommendation>({
  priority:      { type: String, enum: ['high', 'medium', 'low'], required: true },
  category:      { type: String, required: true },
  suggestion:    { type: String, required: true },
  resourceLinks: { type: [String], default: [] },
}, { _id: false });

const GapAnalysisSchema = new Schema<IGapAnalysis>({
  overallScore:    { type: Number, min: 0, max: 100 },
  strengths:       { type: [String], default: [] },
  gaps:            { type: [String], default: [] },
  recommendations: { type: [RecommendationSchema], default: [] },
}, { _id: false });

const ProfileSummarySchema = new Schema<IProfileSummary>({
  hasDegree:              { type: Boolean, default: false },
  highestDegree:          { type: String },
  fieldOfStudy:           { type: String },
  institution:            { type: String },
  gradeAverage:           { type: Number },
  totalYearsOfExperience: { type: Number },
  lastRoleTitle:          { type: String },
  lastRoleCompany:        { type: String },
  topSkills:              { type: [String], default: [] },
  recommendedCourses:     { type: [String], default: [] },
}, { _id: false });

const ProfessionalDNASchema = new Schema<IProfessionalDNA>(
  {
    userId:   { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    resumeId: { type: Schema.Types.ObjectId, ref: 'Resume' },
    candidateName:  { type: String },
    candidateEmail: { type: String },
    skills:        { type: [SkillSchema],      default: [] },
    experience:    { type: [ExperienceSchema], default: [] },
    education:     { type: [EducationSchema],  default: [] },
    gapAnalysis:   { type: GapAnalysisSchema },
    profileSummary:{ type: ProfileSummarySchema },
    rawResumeText: { type: String },
    analysisStatus: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

ProfessionalDNASchema.index({ userId: 1, updatedAt: -1 });

export const ProfessionalDNA = mongoose.model<IProfessionalDNA>(
  'ProfessionalDNA',
  ProfessionalDNASchema
);
