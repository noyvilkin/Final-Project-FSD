import mongoose, { Document, Schema, Types } from 'mongoose';

interface IStarComponent {
  detected: boolean;
  feedback?: string;
}

interface IStarAlignment {
  score: number;
  situation: IStarComponent;
  task:      IStarComponent;
  action:    IStarComponent;
  result:    IStarComponent;
}

interface IFillerWord {
  word: string;
  count: number;
}

interface IFillerWords {
  totalCount: number;
  ratePerMinute: number;
  examples: IFillerWord[];
}

interface ISentiment {
  overallTone: 'confident' | 'neutral' | 'hesitant';
  clarityScore: number;
}

interface IInsights {
  overallScore:  number;
  starAlignment: IStarAlignment;
  fillerWords:   IFillerWords;
  sentiment:     ISentiment;
  strengths:     string[];
  improvements:  string[];
}

export interface IInterviewInsights extends Document {
  userId: Types.ObjectId;
  mediaFileKey: string;
  mediaType: 'audio' | 'video';
  status: 'pending' | 'transcribing' | 'analyzing' | 'completed' | 'failed';
  transcript?: string;
  insights?: IInsights;
  jobId?: string;
  fileSizeBytes?: number;
  mimeType?: string;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const StarComponentSchema = new Schema<IStarComponent>({
  detected: { type: Boolean, required: true },
  feedback: { type: String },
}, { _id: false });

const StarAlignmentSchema = new Schema<IStarAlignment>({
  score:     { type: Number, min: 0, max: 100 },
  situation: { type: StarComponentSchema },
  task:      { type: StarComponentSchema },
  action:    { type: StarComponentSchema },
  result:    { type: StarComponentSchema },
}, { _id: false });

const FillerWordSchema = new Schema<IFillerWord>({
  word:  { type: String, required: true },
  count: { type: Number, required: true },
}, { _id: false });

const FillerWordsSchema = new Schema<IFillerWords>({
  totalCount:     { type: Number, default: 0 },
  ratePerMinute:  { type: Number, default: 0 },
  examples:       { type: [FillerWordSchema], default: [] },
}, { _id: false });

const SentimentSchema = new Schema<ISentiment>({
  overallTone:  { type: String, enum: ['confident', 'neutral', 'hesitant'] },
  clarityScore: { type: Number, min: 0, max: 100 },
}, { _id: false });

const InsightsSchema = new Schema<IInsights>({
  overallScore:  { type: Number, min: 0, max: 100 },
  starAlignment: { type: StarAlignmentSchema },
  fillerWords:   { type: FillerWordsSchema },
  sentiment:     { type: SentimentSchema },
  strengths:     { type: [String], default: [] },
  improvements:  { type: [String], default: [] },
}, { _id: false });

const InterviewInsightsSchema = new Schema<IInterviewInsights>(
  {
    userId:       { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    mediaFileKey: { type: String, required: true },
    mediaType:    { type: String, enum: ['audio', 'video'], required: true },
    status: {
      type: String,
      enum: ['pending', 'transcribing', 'analyzing', 'completed', 'failed'],
      default: 'pending',
    },
    transcript: { type: String },
    insights:   { type: InsightsSchema },
    jobId:         { type: String },
    fileSizeBytes: { type: Number },
    mimeType:      { type: String },
    errorMessage:  { type: String },
  },
  { timestamps: true }
);

export const InterviewInsights = mongoose.model<IInterviewInsights>(
  'InterviewInsights',
  InterviewInsightsSchema
);
