import mongoose, { Document, Schema, Types } from "mongoose";

export type InterviewJobStatus =
  | "Pending"
  | "Transcribing"
  | "Transcribed"
  | "Analyzing"
  | "Analyzed"
  | "Completed"
  | "Failed";

export interface IInterviewJob extends Document {
  userId:           Types.ObjectId;
  mediaFileKey:     string;
  mediaType:        "audio" | "video";
  mimeType:         string;
  sizeBytes:        number;
  durationSeconds?: number;
  status:           InterviewJobStatus;
  correlationId:    string;
  transcriptKey?:   string;
  errorMessage?:    string;
  createdAt:        Date;
  updatedAt:        Date;
}

const InterviewJobSchema = new Schema<IInterviewJob>(
  {
    userId:          { type: Schema.Types.ObjectId, ref: "User", required: true },
    mediaFileKey:    { type: String, required: true },
    mediaType:       { type: String, enum: ["audio", "video"], required: true },
    mimeType:        { type: String, required: true },
    sizeBytes:       { type: Number, required: true },
    durationSeconds: { type: Number },
    status: {
      type:     String,
      enum:     ["Pending", "Transcribing", "Transcribed", "Analyzing", "Analyzed", "Completed", "Failed"],
      default:  "Pending",
      required: true,
    },
    correlationId: { type: String, required: true, index: true },
    transcriptKey: { type: String },
    errorMessage:  { type: String },
  },
  { timestamps: true }
);

InterviewJobSchema.index({ userId: 1, status: 1, createdAt: -1 });

export const InterviewJob = mongoose.model<IInterviewJob>(
  "InterviewJob",
  InterviewJobSchema
);
