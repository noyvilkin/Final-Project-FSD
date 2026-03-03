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

interface IMetadata {
  detectedLanguage?: string;
  projectScope?: 'small' | 'medium' | 'large';
  fileCount?: number;
}

export interface IAssignmentFeedback extends Document {
  userId: Types.ObjectId;
  requirementsFileKey: string;
  solutionFileKey: string;
  metadata: IMetadata;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  feedback?: IFeedback;
  jobId?: string;
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

const MetadataSchema = new Schema<IMetadata>({
  detectedLanguage: { type: String },
  projectScope:     { type: String, enum: ['small', 'medium', 'large'] },
  fileCount:        { type: Number },
}, { _id: false });

const AssignmentFeedbackSchema = new Schema<IAssignmentFeedback>(
  {
    userId:              { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    requirementsFileKey: { type: String, required: true },
    solutionFileKey:     { type: String, required: true },
    metadata:            { type: MetadataSchema, default: {} },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    feedback: { type: FeedbackSchema },
    jobId:    { type: String },
  },
  { timestamps: true }
);

export const AssignmentFeedback = mongoose.model<IAssignmentFeedback>(
  'AssignmentFeedback',
  AssignmentFeedbackSchema
);