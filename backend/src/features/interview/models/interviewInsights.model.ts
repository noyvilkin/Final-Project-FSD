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

export type InsightsStatus = 'not_started' | 'analyzing' | 'completed' | 'failed';

// ─── Insight sub-types ────────────────────────────────────────────────────────

export interface IStarSection {
  text:      string;
  start:     number | null;
  end:       number | null;
  score:     number;
  feedback:  string;
}

export interface IStarActionSection extends IStarSection {
  candidateOwnedAction:    boolean;
  teamOnlyLanguageDetected: boolean;
}

export interface IStarAnalysis {
  situation: IStarSection;
  task:      IStarSection;
  action:    IStarActionSection;
  result:    IStarSection;
}

export interface ICandidateActionAssessment {
  candidateOwnedActionScore: number;
  usesPersonalAgency:        boolean;
  teamLanguageDetected:      boolean;
  feedback:                  string;
}

export interface IFillerWordBreakdown {
  word:  string;
  count: number;
}

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

  // Pipeline timestamps
  processingStartedAt?:      Date;
  transcriptionCompletedAt?: Date;

  // Internal transcription error – never returned to the frontend
  processingError?: IProcessingError;

  // ── Gemini insight fields ─────────────────────────────────────────────────
  insightsStatus:              InsightsStatus;
  fillerWordCount?:            number;
  fillerWordsBreakdown?:       IFillerWordBreakdown[];
  wordsPerMinute?:             number;
  estimatedSpeakingDurationSeconds?: number;
  confidenceScore?:            number;
  starAnalysis?:               IStarAnalysis;
  candidateActionAssessment?:  ICandidateActionAssessment;
  strengths?:                  string[];
  weaknesses?:                 string[];
  recommendations?:            string[];
  geminiProvider?:             string;
  geminiModel?:                string;
  insightsCompletedAt?:        Date;
  // Internal insights error – never returned to the frontend
  insightsError?: IProcessingError;

  // Existing legacy insight sub-document (preserved for backward compat)
  insights?: IInsights;
  jobId?:     string;
  jobTitle?:  string;
  company?:   string;

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

// ─── Insight sub-document schemas ────────────────────────────────────────────

const StarSectionSchema = new Schema<IStarSection>({
  text:     { type: String, default: '' },
  start:    { type: Number, default: null },
  end:      { type: Number, default: null },
  score:    { type: Number, min: 0, max: 100, default: 0 },
  feedback: { type: String, default: '' },
}, { _id: false });

const StarActionSectionSchema = new Schema<IStarActionSection>({
  text:                    { type: String, default: '' },
  start:                   { type: Number, default: null },
  end:                     { type: Number, default: null },
  score:                   { type: Number, min: 0, max: 100, default: 0 },
  feedback:                { type: String, default: '' },
  candidateOwnedAction:    { type: Boolean, default: false },
  teamOnlyLanguageDetected: { type: Boolean, default: false },
}, { _id: false });

const StarAnalysisSchema = new Schema<IStarAnalysis>({
  situation: { type: StarSectionSchema },
  task:      { type: StarSectionSchema },
  action:    { type: StarActionSectionSchema },
  result:    { type: StarSectionSchema },
}, { _id: false });

const CandidateActionAssessmentSchema = new Schema<ICandidateActionAssessment>({
  candidateOwnedActionScore: { type: Number, min: 0, max: 100, default: 0 },
  usesPersonalAgency:        { type: Boolean, default: false },
  teamLanguageDetected:      { type: Boolean, default: false },
  feedback:                  { type: String, default: '' },
}, { _id: false });

const FillerWordBreakdownSchema = new Schema<IFillerWordBreakdown>({
  word:  { type: String, required: true },
  count: { type: Number, required: true },
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

const INSIGHTS_STATUSES: InsightsStatus[] = ['not_started', 'analyzing', 'completed', 'failed'];

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

    // Internal transcription error – never returned to callers
    processingError: { type: ProcessingErrorSchema },

    // ── Gemini insight fields ───────────────────────────────────────────────
    insightsStatus: {
      type:    String,
      enum:    INSIGHTS_STATUSES,
      default: 'not_started',
      index:   true,
    },
    fillerWordCount:            { type: Number },
    fillerWordsBreakdown:       { type: [FillerWordBreakdownSchema], default: undefined },
    wordsPerMinute:             { type: Number },
    estimatedSpeakingDurationSeconds: { type: Number },
    confidenceScore:            { type: Number, min: 0, max: 100 },
    starAnalysis:               { type: StarAnalysisSchema },
    candidateActionAssessment:  { type: CandidateActionAssessmentSchema },
    strengths:                  { type: [String], default: undefined },
    weaknesses:                 { type: [String], default: undefined },
    recommendations:            { type: [String], default: undefined },
    geminiProvider:             { type: String },
    geminiModel:                { type: String },
    insightsCompletedAt:        { type: Date },
    // Internal insights error – never returned to callers
    insightsError:              { type: ProcessingErrorSchema },

    // Existing fields preserved
    insights:  { type: InsightsSchema },
    jobId:     { type: String },
    jobTitle:  { type: String },
    company:   { type: String },
  },
  { timestamps: true }
);

// Compound index for user history queries sorted by date
InterviewInsightsSchema.index({ userId: 1, createdAt: -1 });

// Status index for pipeline/admin queries filtering by processing state
InterviewInsightsSchema.index({ status: 1 });

// Compound index for user-scoped status filtering
InterviewInsightsSchema.index({ userId: 1, status: 1 });

export const InterviewInsights = mongoose.model<IInterviewInsights>(
  'InterviewInsights',
  InterviewInsightsSchema
);
