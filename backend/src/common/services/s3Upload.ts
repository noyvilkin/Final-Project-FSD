import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import { appLogger } from "./logger.js";

const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY_ID;
const S3_SECRET_KEY = process.env.S3_SECRET_ACCESS_KEY;
const S3_BUCKET = process.env.S3_BUCKET_NAME;

if (!S3_ENDPOINT || !S3_ACCESS_KEY || !S3_SECRET_KEY || !S3_BUCKET) {
  throw new Error(
    "[s3] Missing required env vars: S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET_NAME"
  );
}

const s3 = new S3Client({
  endpoint: S3_ENDPOINT,
  region: "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: S3_ACCESS_KEY,
    secretAccessKey: S3_SECRET_KEY,
  },
});

const ensureBucket = async (bucket: string): Promise<void> => {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    appLogger.info("[s3] Bucket verified", { bucket });
  } catch {
    appLogger.info("[s3] Bucket not found, creating", { bucket });
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    appLogger.info("[s3] Bucket created", { bucket });
  }
};

let bucketReady: Promise<void> | null = null;

const getBucketReady = (): Promise<void> => {
  if (!bucketReady) {
    bucketReady = ensureBucket(S3_BUCKET);
  }
  return bucketReady;
};

const sanitizeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_");

export type StoragePath = "resumes" | "assignments" | "interviews";

type UploadInput = {
  file: Express.Multer.File;
  path: StoragePath;
  userId?: string;
  assignmentId?: string;
};

export const uploadFileToS3 = async ({ file, path, userId, assignmentId }: UploadInput) => {
  await getBucketReady();

  let key: string;
  
  // For assignments, organize by userId and assignmentId
  if (path === 'assignments' && userId && assignmentId) {
    key = `${path}/${userId}/${assignmentId}/${randomUUID()}-${sanitizeName(file.originalname)}`;
  } else {
    // For other paths or if userId/assignmentId not provided, use simple structure
    key = `${path}/${randomUUID()}-${sanitizeName(file.originalname)}`;
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    })
  );

  appLogger.info("[s3] File uploaded", { bucket: S3_BUCKET, key, size: file.size });

  return {
    bucket: S3_BUCKET,
    key,
    url: `${S3_ENDPOINT}/${S3_BUCKET}/${key}`,
    mimeType: file.mimetype,
    size: file.size,
  };
};
