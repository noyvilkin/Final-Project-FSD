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
  score:    { type: Number, min: 0, max: 100, required: true },
  comments: { type: [String], default: [] },
}, { _id: false });

const FeedbackSchema = new Schema<IFeedback>({
  overallScore:          { type: Number, min: 0, max: 100 },
  requirementsCoverage:  { type: Number, min: 0, max: 100 },
  strengths:             { type: [String], default: [] },
  improvements:          { type: [String], default: [] },
  codeQuality:           { type: CodeQualitySchema },
  requirementsAnalysis:  { type: [RequirementAnalysisSchema], default: [] },
}, { _id: false });

// AI Feedback Schemas
const AICodeQualitySchema = new Schema<IAICodeQuality>({
  score:      { type: Number, min: 0, max: 100, required: true },
  strengths:  { type: [String], default: [] },
  weaknesses: { type: [String], default: [] },
}, { _id: false });

const AIFunctionalCorrectnessSchema = new Schema<IAIFunctionalCorrectness>({
  score:             { type: Number, min: 0, max: 100, required: true },
  meetsRequirements: { type: Boolean, required: true },
  missingFeatures:   { type: [String], default: [] },
}, { _id: false });

const AIBestPracticesSchema = new Schema<IAIBestPractices>({
  score:              { type: Number, min: 0, max: 100, required: true },
  followsConventions: { type: Boolean, required: true },
  suggestions:        { type: [String], default: [] },
}, { _id: false });

const AIOverallSchema = new Schema<IAIOverall>({
  score:   { type: Number, min: 0, max: 100, required: true },
  grade:   { type: String, required: true },
  summary: { type: String, required: true },
}, { _id: false });

const AIFeedbackSchema = new Schema<IAIFeedback>({
  codeQuality:           { type: AICodeQualitySchema, required: true },
  functionalCorrectness: { type: AIFunctionalCorrectnessSchema, required: true },
  bestPractices:         { type: AIBestPracticesSchema, required: true },
  overall:               { type: AIOverallSchema, required: true },
}, { _id: false });

const MetadataSchema = new Schema<IMetadata>({
  detectedLanguage: { type: String },
  detectedFrameworks: { type: [String], default: [] },
  projectScope:     { type: String, enum: ['small', 'medium', 'large'] },
  totalFiles:       { type: Number },
  totalLines:       { type: Number },
  requirements:     { type: String },
  sourceCodeContent: {
    type: Schema.Types.Mixed, // Object with string keys and string values
    default: {}
  },
  fileCount:        { type: Number },
  extractedRequirements: { type: String },
  sourceCodeSummary: { type: String },
  scanMetadata: {
    frameworks: { type: [String], default: [] },
    buildSystem: { type: String },
    hasTests: { type: Boolean },
    hasDocumentation: { type: Boolean },
    qualityScore: { type: Number, min: 0, max: 100 },
    complexity: {
      linesOfCode: { type: Number },
      cyclomaticComplexity: { type: Number },
      testCoverage: { type: Number }
    },
    projectType: {
      type: String,
      enum: ['web-frontend', 'web-backend', 'mobile', 'desktop', 'library', 'data-science', 'game', 'other']
    },
    recommendations: { type: [String], default: [] }
  }
}, { _id: false });

const AssignmentFeedbackSchema = new Schema<IAssignmentFeedback>(
  {
    userId:              { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    requirementsFileKey: { type: String, required: true },
    solutionFileKey:     { type: String, required: true },
    metadata:            { type: MetadataSchema, default: {} },
    status: {
      type: String,
      enum: ['pending', 'scanning', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    feedback:    { type: FeedbackSchema },
    aiFeedback:  { type: AIFeedbackSchema },
    jobId:       { type: String },
    processingErrors: { type: [String], default: [] },
    aiAnalysisCompletedAt: { type: Date },
  },
  { timestamps: true }
);

export const AssignmentFeedback = mongoose.model<IAssignmentFeedback>(
  'AssignmentFeedback',
  AssignmentFeedbackSchema
);