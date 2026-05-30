import mongoose, { Document, Schema, Types } from 'mongoose';

// ─── Transcription types ──────────────────────────────────────────────────────

export interface ITranscriptSegment {
  start: number;
  end:   number;
  text:  string;
}

export interface IProcessingError {
  stage:   string;
  message: string;
}

// ─── Existing insight types (preserved for backward compat) ───────────────────

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

// ─── Processing status ────────────────────────────────────────────────────────

export type InterviewProcessingStatus =
  | 'uploaded'
  | 'queued'
  | 'downloading'
  | 'extracting_audio'
  | 'transcribing'
  | 'analyzing'
  | 'completed'
  | 'failed';

// ─── Main document interface ──────────────────────────────────────────────────

export interface IInterviewInsights extends Document {
  userId:       Types.ObjectId;
  mediaFileKey: string;
  mediaType:    'audio' | 'video';

  /** @deprecated use processingStatus instead */
  status: 'pending' | 'transcribing' | 'analyzing' | 'completed' | 'failed';

  processingStatus: InterviewProcessingStatus;

  // Transcription fields
  transcript?:             string;
  transcriptSegments?:     ITranscriptSegment[];
  transcriptionProvider?:  string;
  transcriptionModel?:     string;
  transcriptionLanguage?:  string;
  transcriptionDurationMs?: number;
  mediaDurationSeconds?:   number;

  // Timestamps for pipeline stages
  processingStartedAt?:      Date;
  transcriptionCompletedAt?: Date;

  // Internal error storage – never returned to the frontend
  processingError?: IProcessingError;

  // Existing insight fields (preserved)
  insights?: IInsights;
  jobId?:    string;

  createdAt: Date;
  updatedAt: Date;
}

// ─── Sub-document schemas ─────────────────────────────────────────────────────

const TranscriptSegmentSchema = new Schema<ITranscriptSegment>({
  start: { type: Number, required: true },
  end:   { type: Number, required: true },
  text:  { type: String, required: true },
}, { _id: false });

const ProcessingErrorSchema = new Schema<IProcessingError>({
  stage:   { type: String, required: true },
  message: { type: String, required: true },
}, { _id: false });

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
  totalCount:    { type: Number, default: 0 },
  ratePerMinute: { type: Number, default: 0 },
  examples:      { type: [FillerWordSchema], default: [] },
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

// ─── Main schema ──────────────────────────────────────────────────────────────

const PROCESSING_STATUSES: InterviewProcessingStatus[] = [
  'uploaded',
  'queued',
  'downloading',
  'extracting_audio',
  'transcribing',
  'analyzing',
  'completed',
  'failed',
];

const InterviewInsightsSchema = new Schema<IInterviewInsights>(
  {
    userId:       { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    mediaFileKey: { type: String, required: true },
    mediaType:    { type: String, enum: ['audio', 'video'], required: true },

    // Legacy status field – kept so existing records are not broken
    status: {
      type:    String,
      enum:    ['pending', 'transcribing', 'analyzing', 'completed', 'failed'],
      default: 'pending',
    },

    processingStatus: {
      type:    String,
      enum:    PROCESSING_STATUSES,
      default: 'uploaded',
      index:   true,
    },

    // Transcription
    transcript:              { type: String },
    transcriptSegments:      { type: [TranscriptSegmentSchema], default: undefined },
    transcriptionProvider:   { type: String },
    transcriptionModel:      { type: String },
    transcriptionLanguage:   { type: String },
    transcriptionDurationMs: { type: Number },
    mediaDurationSeconds:    { type: Number },

    // Pipeline timestamps
    processingStartedAt:      { type: Date },
    transcriptionCompletedAt: { type: Date },

    // Internal error – never returned to callers
    processingError: { type: ProcessingErrorSchema },

    // Existing fields preserved
    insights: { type: InsightsSchema },
    jobId:    { type: String },
  },
  { timestamps: true }
);

export const InterviewInsights = mongoose.model<IInterviewInsights>(
  'InterviewInsights',
  InterviewInsightsSchema
);
