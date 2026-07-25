import mongoose, { Document, Schema, Types } from 'mongoose';

interface IAIRequirementCoverage {
  requirement: string;
  status: 'met' | 'partial' | 'missing';
  justification: string;
}

interface IAICodeQuality {
  score: number;
  strengths: string[];
  weaknesses: string[];
}

interface IAIFunctionalCorrectness {
  score: number;
  meetsRequirements: boolean;
  missingFeatures: string[];
}

interface IAIBestPractices {
  score: number;
  followsConventions: boolean;
  suggestions: string[];
}

interface IAIOverall {
  score: number;
  grade: string;
  summary: string;
}

interface IAIFeedback {
  requirementsCoverage?: IAIRequirementCoverage[];
  codeQuality: IAICodeQuality;
  functionalCorrectness: IAIFunctionalCorrectness;
  bestPractices: IAIBestPractices;
  overall: IAIOverall;
}

export interface IMetadata {
  detectedLanguage?: string;
  detectedFrameworks?: string[];
  projectScope?: 'small' | 'medium' | 'large';
  totalFiles?: number;
  totalLines?: number;
  requirements?: string;
  sourceCodeContent?: { [filePath: string]: string };
  fileCount?: number;
  extractedRequirements?: string;
  sourceCodeSummary?: string;
  scanMetadata?: {
    frameworks?: string[];
    buildSystem?: string;
    hasTests?: boolean;
    hasDocumentation?: boolean;
    qualityScore?: number;
    complexity?: {
      linesOfCode: number;
      cyclomaticComplexity: number;
      testCoverage: number;
    };
    projectType?: 'web-frontend' | 'web-backend' | 'mobile' | 'desktop' | 'library' | 'data-science' | 'game' | 'other';
    recommendations?: string[];
  };
}

export interface IAssignmentFeedback extends Document {
  userId: Types.ObjectId;
  requirementsFileKey: string;
  solutionFileKey: string;
  userNotes?: string;
  metadata: IMetadata;
  status: 'pending' | 'scanning' | 'processing' | 'completed' | 'failed';
  aiFeedback?: IAIFeedback;
  processingErrors?: string[];
  aiAnalysisCompletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AIRequirementCoverageSchema = new Schema<IAIRequirementCoverage>({
  requirement:   { type: String },
  status:        { type: String, enum: ['met', 'partial', 'missing'], default: 'partial' },
  justification: { type: String }
}, { _id: false });

const AICodeQualitySchema = new Schema<IAICodeQuality>({
  score:       { type: Number, min: 0, max: 100 },
  strengths:   { type: [String], default: [] },
  weaknesses:  { type: [String], default: [] }
}, { _id: false });

const AIFunctionalCorrectnessSchema = new Schema<IAIFunctionalCorrectness>({
  score:               { type: Number, min: 0, max: 100 },
  meetsRequirements:   { type: Boolean, default: false },
  missingFeatures:     { type: [String], default: [] }
}, { _id: false });

const AIBestPracticesSchema = new Schema<IAIBestPractices>({
  score:          { type: Number, min: 0, max: 100 },
  followsConventions: { type: Boolean, default: false },
  suggestions:    { type: [String], default: [] }
}, { _id: false });

const AIOverallSchema = new Schema<IAIOverall>({
  score:   { type: Number, min: 0, max: 100 },
  grade:   { type: String },
  summary: { type: String }
}, { _id: false });

const AIFeedbackSchema = new Schema<IAIFeedback>({
  requirementsCoverage:     { type: [AIRequirementCoverageSchema], default: [] },
  codeQuality:              { type: AICodeQualitySchema },
  functionalCorrectness:    { type: AIFunctionalCorrectnessSchema },
  bestPractices:            { type: AIBestPracticesSchema },
  overall:                  { type: AIOverallSchema }
}, { _id: false });


// Metadata schema
const MetadataSchema = new Schema<IMetadata>({
  detectedLanguage:     { type: String },
  detectedFrameworks:   { type: [String], default: [] },
  projectScope:         { type: String, enum: ['small', 'medium', 'large'] },
  totalFiles:           { type: Number },
  totalLines:           { type: Number },
  requirements:         { type: String },
  sourceCodeContent:    { type: Schema.Types.Mixed },
  fileCount:            { type: Number },
  extractedRequirements: { type: String },
  sourceCodeSummary:    { type: String },
  scanMetadata:         { type: Schema.Types.Mixed }
}, { _id: false });

// Main schema
const AssignmentFeedbackSchema = new Schema<IAssignmentFeedback>(
  {
    userId:              { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    requirementsFileKey: { type: String, default: '' },
    solutionFileKey:     { type: String, required: true },
    userNotes:           { type: String, trim: true, maxlength: 5000 },
    metadata:            { type: MetadataSchema, default: {} },
    status: {
      type: String,
      enum: ['pending', 'scanning', 'processing', 'completed', 'failed'],
      default: 'pending'
    },
    aiFeedback:          { type: AIFeedbackSchema },
    processingErrors:    { type: [String], default: [] },
    aiAnalysisCompletedAt: { type: Date }
  },
  { timestamps: true }
);

export const AssignmentFeedback = mongoose.model<IAssignmentFeedback>(
  'AssignmentFeedback',
  AssignmentFeedbackSchema
);
