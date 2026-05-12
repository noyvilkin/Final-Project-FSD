import mongoose, { Document, Schema, Types } from "mongoose";

// The InterviewInsights document is the analysis output side of an interview.
// Upload metadata + workflow status live on InterviewJob (see interviewJob.model.ts).
// Each InterviewInsights doc is uniquely tied to one InterviewJob via interviewJobId.
//
// The `analyzers` subdoc holds raw per-analyzer outputs (Mission 02). The
// `insights` subdoc holds the synthesised, human-facing aggregate (Mission 03).

// --------- legacy / aggregate insights (Mission 03 will populate) ----------

interface IStarComponent {
  detected: boolean;
  feedback?: string;
}

interface IStarAlignmentAggregate {
  score:     number;
  situation: IStarComponent;
  task:      IStarComponent;
  action:    IStarComponent;
  result:    IStarComponent;
}

interface IFillerWordExample {
  word:  string;
  count: number;
}

interface IFillerWordsAggregate {
  totalCount:    number;
  ratePerMinute: number;
  examples:      IFillerWordExample[];
}

interface ISentimentAggregate {
  overallTone:  "confident" | "neutral" | "hesitant";
  clarityScore: number;
}

interface IInsights {
  overallScore:  number;
  starAlignment: IStarAlignmentAggregate;
  fillerWords:   IFillerWordsAggregate;
  sentiment:     ISentimentAggregate;
  strengths:     string[];
  improvements:  string[];
}

// --------- Mission 02 analyzer outputs ----------

export interface IContentQualityOutput {
  technicalAccuracy:     number;
  professionalRelevance: number;
  justification:         string;
  promptVersion:         string;
  modelVersion?:         string;
}

export interface IStarSegmentAlignment {
  start: number;
  end:   number;
  text:  string;
  components: {
    situation: boolean;
    task:      boolean;
    action:    boolean;
    result:    boolean;
  };
}

export interface IStarAlignmentOutput {
  segments:           IStarSegmentAlignment[];
  starAlignmentScore: number;
  promptVersion:      string;
  modelVersion?:      string;
}

export interface IFillerWordsOutput {
  counts:     Record<string, number>;
  total:      number;
  totalWords: number;
  density:    number;
  perMinute:  number;
}

export interface IConfidenceOutput {
  confidenceScore: number;
  fluencyScore:    number;
  signals: {
    polarityAverage: number;
    polarityScore:   number;
    fillerDensity:   number;
    wordsPerMinute:  number;
  };
}

export interface IAnalyzerOutputs {
  contentQuality?: IContentQualityOutput;
  starAlignment?:  IStarAlignmentOutput;
  fillerWords?:    IFillerWordsOutput;
  confidence?:     IConfidenceOutput;
  analyzedAt?:     Date;
}

// --------- Mission 03 synthesis ----------

export interface IReadinessBreakdown {
  technical:     number;
  behavioral:    number;
  communication: number;
}

export interface IReadinessOutput {
  readinessScore: number;
  breakdown:      IReadinessBreakdown;
}

export type CoachingTipType = "technical" | "behavioral" | "verbal";

export interface ICoachingTip {
  type:              CoachingTipType;
  issue:             string;
  suggestion:        string;
  exampleRewording?: string;
}

export interface ICoachingOutput {
  tips:          ICoachingTip[];
  promptVersion: string;
  modelVersion?: string;
}

// --------- top-level document ----------

export interface IInterviewInsights extends Document {
  userId:         Types.ObjectId;
  interviewJobId: Types.ObjectId;
  transcript?:    string;
  analyzers?:     IAnalyzerOutputs;
  readiness?:     IReadinessOutput;
  coaching?:      ICoachingOutput;
  insights?:      IInsights;
  version:        number;
  createdAt:      Date;
  updatedAt:      Date;
}

// --------- schemas ----------

const StarComponentSchema = new Schema<IStarComponent>(
  {
    detected: { type: Boolean, required: true },
    feedback: { type: String },
  },
  { _id: false }
);

const StarAlignmentAggregateSchema = new Schema<IStarAlignmentAggregate>(
  {
    score:     { type: Number, min: 0, max: 100 },
    situation: { type: StarComponentSchema },
    task:      { type: StarComponentSchema },
    action:    { type: StarComponentSchema },
    result:    { type: StarComponentSchema },
  },
  { _id: false }
);

const FillerWordExampleSchema = new Schema<IFillerWordExample>(
  {
    word:  { type: String, required: true },
    count: { type: Number, required: true },
  },
  { _id: false }
);

const FillerWordsAggregateSchema = new Schema<IFillerWordsAggregate>(
  {
    totalCount:    { type: Number, default: 0 },
    ratePerMinute: { type: Number, default: 0 },
    examples:      { type: [FillerWordExampleSchema], default: [] },
  },
  { _id: false }
);

const SentimentAggregateSchema = new Schema<ISentimentAggregate>(
  {
    overallTone:  { type: String, enum: ["confident", "neutral", "hesitant"] },
    clarityScore: { type: Number, min: 0, max: 100 },
  },
  { _id: false }
);

const InsightsSchema = new Schema<IInsights>(
  {
    overallScore:  { type: Number, min: 0, max: 100 },
    starAlignment: { type: StarAlignmentAggregateSchema },
    fillerWords:   { type: FillerWordsAggregateSchema },
    sentiment:     { type: SentimentAggregateSchema },
    strengths:     { type: [String], default: [] },
    improvements:  { type: [String], default: [] },
  },
  { _id: false }
);

// Mission 02 analyzer sub-schemas

const ContentQualitySchema = new Schema<IContentQualityOutput>(
  {
    technicalAccuracy:     { type: Number, min: 0, max: 100, required: true },
    professionalRelevance: { type: Number, min: 0, max: 100, required: true },
    justification:         { type: String, required: true },
    promptVersion:         { type: String, required: true },
    modelVersion:          { type: String },
  },
  { _id: false }
);

const StarSegmentAlignmentSchema = new Schema<IStarSegmentAlignment>(
  {
    start: { type: Number, required: true },
    end:   { type: Number, required: true },
    text:  { type: String, required: true },
    components: {
      situation: { type: Boolean, default: false },
      task:      { type: Boolean, default: false },
      action:    { type: Boolean, default: false },
      result:    { type: Boolean, default: false },
    },
  },
  { _id: false }
);

const StarAlignmentOutputSchema = new Schema<IStarAlignmentOutput>(
  {
    segments:           { type: [StarSegmentAlignmentSchema], default: [] },
    starAlignmentScore: { type: Number, min: 0, max: 100, required: true },
    promptVersion:      { type: String, required: true },
    modelVersion:       { type: String },
  },
  { _id: false }
);

const FillerWordsOutputSchema = new Schema<IFillerWordsOutput>(
  {
    counts:     { type: Schema.Types.Mixed, default: {} },
    total:      { type: Number, default: 0 },
    totalWords: { type: Number, default: 0 },
    density:    { type: Number, default: 0 },
    perMinute:  { type: Number, default: 0 },
  },
  { _id: false }
);

const ConfidenceOutputSchema = new Schema<IConfidenceOutput>(
  {
    confidenceScore: { type: Number, min: 0, max: 100, required: true },
    fluencyScore:    { type: Number, min: 0, max: 100, required: true },
    signals: {
      polarityAverage: { type: Number, required: true },
      polarityScore:   { type: Number, required: true },
      fillerDensity:   { type: Number, required: true },
      wordsPerMinute:  { type: Number, required: true },
    },
  },
  { _id: false }
);

const AnalyzerOutputsSchema = new Schema<IAnalyzerOutputs>(
  {
    contentQuality: { type: ContentQualitySchema },
    starAlignment:  { type: StarAlignmentOutputSchema },
    fillerWords:    { type: FillerWordsOutputSchema },
    confidence:     { type: ConfidenceOutputSchema },
    analyzedAt:     { type: Date },
  },
  { _id: false }
);

// Mission 03 synthesis sub-schemas

const ReadinessBreakdownSchema = new Schema<IReadinessBreakdown>(
  {
    technical:     { type: Number, min: 0, max: 100, required: true },
    behavioral:    { type: Number, min: 0, max: 100, required: true },
    communication: { type: Number, min: 0, max: 100, required: true },
  },
  { _id: false }
);

const ReadinessOutputSchema = new Schema<IReadinessOutput>(
  {
    readinessScore: { type: Number, min: 0, max: 100, required: true },
    breakdown:      { type: ReadinessBreakdownSchema, required: true },
  },
  { _id: false }
);

const CoachingTipSchema = new Schema<ICoachingTip>(
  {
    type:             { type: String, enum: ["technical", "behavioral", "verbal"], required: true },
    issue:            { type: String, required: true },
    suggestion:       { type: String, required: true },
    exampleRewording: { type: String },
  },
  { _id: false }
);

const CoachingOutputSchema = new Schema<ICoachingOutput>(
  {
    tips:          { type: [CoachingTipSchema], default: [] },
    promptVersion: { type: String, required: true },
    modelVersion:  { type: String },
  },
  { _id: false }
);

const InterviewInsightsSchema = new Schema<IInterviewInsights>(
  {
    userId:         { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    interviewJobId: { type: Schema.Types.ObjectId, ref: "InterviewJob", required: true, unique: true, index: true },
    transcript:     { type: String },
    analyzers:      { type: AnalyzerOutputsSchema },
    readiness:      { type: ReadinessOutputSchema },
    coaching:       { type: CoachingOutputSchema },
    insights:       { type: InsightsSchema },
    version:        { type: Number, default: 1, required: true },
  },
  { timestamps: true }
);

export const InterviewInsights = mongoose.model<IInterviewInsights>(
  "InterviewInsights",
  InterviewInsightsSchema
);
