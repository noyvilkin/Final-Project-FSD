import mongoose, { Document, Schema, Types } from 'mongoose';

interface IRequirementAnalysis {
  requirement: string;
  isCovered: boolean;
  comment?: string;
}

interface ICodeQuality {
  score: number;
  comments: string[];
}

interface IFeedback {
  overallScore: number;
  requirementsCoverage: number;
  strengths: string[];
  improvements: string[];
  codeQuality: ICodeQuality;
  requirementsAnalysis: IRequirementAnalysis[];
}

// New AI-generated feedback interfaces
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
  feedback?: IFeedback;
  aiFeedback?: IAIFeedback;
  jobId?: string;
  processingErrors?: string[];
  aiAnalysisCompletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RequirementAnalysisSchema = new Schema<IRequirementAnalysis>({
  requirement: { type: String, required: true },
  isCovered:   { type: Boolean, required: true },
  comment:     { type: String },
}, { _id: false });

const CodeQualitySchema = new Schema<ICodeQuality>({
  score:    { type: Number, min: 0, max: 100 },
  comments: { type: [String], default: [] },
}, { _id: false });

const FeedbackSchema = new Schema<IFeedback>({
  overallScore:        { type: Number, min: 0, max: 100 },
  requirementsCoverage: { type: Number, min: 0, max: 100 },
  strengths:           { type: [String], default: [] },
  improvements:        { type: [String], default: [] },
  codeQuality:         { type: CodeQualitySchema },
  requirementsAnalysis: { type: [RequirementAnalysisSchema], default: [] }
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
    feedback:            { type: FeedbackSchema },
    aiFeedback:          { type: AIFeedbackSchema },
    jobId:               { type: String },
    processingErrors:    { type: [String], default: [] },
    aiAnalysisCompletedAt: { type: Date }
  },
  { timestamps: true }
);

export const AssignmentFeedback = mongoose.model<IAssignmentFeedback>(
  'AssignmentFeedback',
  AssignmentFeedbackSchema
);
