// One-off migration: splits the old InterviewInsights documents (which
// conflated upload metadata + analysis output) into two collections:
//   - interviewjobs      (upload + workflow status)
//   - interviewinsights  (slim — analysis output, references the job)
//
// Idempotent: re-running skips any doc that already has interviewJobId.
//
// Run with: tsx backend/scripts/migrateInterviewSplit.ts
// Requires MONGODB_URI in the environment.

import "dotenv/config";
import mongoose, { Types } from "mongoose";

import { connectToDatabase } from "../src/common/services/database.js";
import { InterviewJob } from "../src/features/interview/models/interviewJob.model.js";
import { InterviewInsights } from "../src/features/interview/models/interviewInsights.model.js";
import { appLogger } from "../src/common/services/logger.js";

interface LegacyDoc {
  _id:           Types.ObjectId;
  userId:        Types.ObjectId;
  mediaFileKey?: string;
  mediaType?:    "audio" | "video";
  status?:       string;
  transcript?:   string;
  insights?:     Record<string, unknown>;
  jobId?:        string;
  createdAt?:    Date;
  updatedAt?:    Date;
}

const STATUS_MAP: Record<string, string> = {
  pending:      "Pending",
  transcribing: "Transcribing",
  analyzing:    "Analyzing",
  completed:    "Completed",
  failed:       "Failed",
};

async function main(): Promise<void> {
  await connectToDatabase();

  const collection = mongoose.connection.collection("interviewinsights");

  // Find docs that still have the old shape (mediaFileKey at top-level,
  // no interviewJobId yet).
  const cursor = collection.find<LegacyDoc>({
    mediaFileKey: { $exists: true },
    interviewJobId: { $exists: false },
  });

  let migrated = 0;
  let skipped  = 0;

  // eslint-disable-next-line no-await-in-loop
  while (await cursor.hasNext()) {
    // eslint-disable-next-line no-await-in-loop
    const legacy = await cursor.next();
    if (!legacy) break;

    if (!legacy.mediaFileKey || !legacy.mediaType || !legacy.userId) {
      appLogger.warn("[migrate] skipping doc with missing required fields", {
        _id: legacy._id.toString(),
      });
      skipped++;
      continue;
    }

    const status = STATUS_MAP[legacy.status ?? "pending"] ?? "Pending";

    // eslint-disable-next-line no-await-in-loop
    const job = await InterviewJob.create({
      userId:        legacy.userId,
      mediaFileKey:  legacy.mediaFileKey,
      mediaType:     legacy.mediaType,
      mimeType:      legacy.mediaType === "audio" ? "audio/mpeg" : "video/mp4",
      sizeBytes:     0,
      status,
      correlationId: legacy.jobId ?? legacy._id.toString(),
      createdAt:     legacy.createdAt,
      updatedAt:     legacy.updatedAt,
    });

    // Rewrite the insights doc to the new shape.
    // eslint-disable-next-line no-await-in-loop
    await collection.updateOne(
      { _id: legacy._id },
      {
        $set: {
          interviewJobId: job._id,
          version:        1,
        },
        $unset: {
          mediaFileKey: "",
          mediaType:    "",
          status:       "",
          jobId:        "",
        },
      }
    );

    migrated++;
  }

  appLogger.info("[migrate] done", { migrated, skipped });
  await mongoose.disconnect();
}

main().catch((err) => {
  appLogger.error("[migrate] failed", { error: err });
  process.exit(1);
});
