import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import { createWriteStream, unlink } from "fs";
import { mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { pipeline } from "stream/promises";
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

export const getS3Client = (): S3Client => s3;
export const getS3Bucket = (): string => S3_BUCKET;

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

const streamToBuffer = async (stream: unknown): Promise<Buffer> => {
  if (!stream || typeof stream !== "object" || !(Symbol.asyncIterator in (stream as object))) {
    throw new Error("[s3] Invalid stream response from S3");
  }
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

/**
 * Retrieve a raw Buffer from Minio/S3 for a given object key.
 */
export const fetchBlobAsBuffer = async (
  fileKey: string,
  bucket: string = S3_BUCKET
): Promise<Buffer> => {
  await getBucketReady();

  const response = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: fileKey })
  );

  const buffer = await streamToBuffer(response.Body);
  appLogger.info("[s3] Blob fetched", { bucket, key: fileKey, bytes: buffer.length });
  return buffer;
};

/**
 * Retrieve an object from Minio/S3 and return its content as a UTF-8 string.
 */
export const fetchBlobAsText = async (
  fileKey: string,
  bucket: string = S3_BUCKET
): Promise<string> => {
  const buffer = await fetchBlobAsBuffer(fileKey, bucket);
  return buffer.toString("utf-8");
};

/**
 * Upload a raw string or Buffer to MinIO/S3 under any bucket + key.
 * Creates the bucket on-the-fly if it doesn't exist.
 */
export const uploadBlob = async (
  key: string,
  body: string | Buffer,
  contentType: string = "text/markdown",
  bucket: string = S3_BUCKET
): Promise<{ bucket: string; key: string; url: string }> => {
  await ensureBucketByName(bucket);

  const buffer = typeof body === "string" ? Buffer.from(body, "utf-8") : body;

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  appLogger.info("[s3] Blob uploaded", { bucket, key, bytes: buffer.length });
  return { bucket, key, url: `${S3_ENDPOINT}/${bucket}/${key}` };
};

/**
 * Delete a single object from MinIO/S3.
 */
export const deleteBlob = async (
  key: string,
  bucket: string = S3_BUCKET
): Promise<void> => {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  appLogger.info("[s3] Blob deleted", { bucket, key });
};

// ─── Temp-file helpers ────────────────────────────────────────────────────────

const CAREERPILOT_TMP_DIR = join(tmpdir(), 'careerpilot');

/**
 * Stream an S3 object directly to a temporary file on disk.
 * Avoids loading large video/audio files into memory.
 *
 * @returns Absolute path of the temp file — caller MUST call `cleanupTempFile` when done.
 */
export const downloadToTempFile = async (
  fileKey: string,
  extension: string = '',
  bucket: string = S3_BUCKET
): Promise<string> => {
  await getBucketReady();
  await mkdir(CAREERPILOT_TMP_DIR, { recursive: true });

  const suffix  = extension.startsWith('.') ? extension : extension ? `.${extension}` : '';
  const tmpPath = join(CAREERPILOT_TMP_DIR, `${randomUUID()}${suffix}`);

  const response = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: fileKey })
  );

  if (!response.Body || !(Symbol.asyncIterator in (response.Body as object))) {
    throw new Error(`[s3] Could not obtain a readable stream for key: ${fileKey}`);
  }

  const writeStream = createWriteStream(tmpPath);
  await pipeline(response.Body as AsyncIterable<Uint8Array>, writeStream);

  appLogger.info('[s3] Object streamed to temp file', { bucket, key: fileKey, tmpPath });
  return tmpPath;
};

/**
 * Delete a temporary file created by `downloadToTempFile`.
 * Errors are swallowed so cleanup failures never mask the real error.
 */
export const cleanupTempFile = (tmpPath: string): void => {
  unlink(tmpPath, (err) => {
    if (err && err.code !== 'ENOENT') {
      appLogger.warn('[s3] Failed to clean up temp file', { tmpPath, error: err.message });
    }
  });
};

// ─────────────────────────────────────────────────────────────────────────────

const bucketCache = new Set<string>();

const ensureBucketByName = async (bucket: string): Promise<void> => {
  if (bucket === S3_BUCKET) {
    await getBucketReady();
    return;
  }
  if (bucketCache.has(bucket)) return;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    appLogger.info("[s3] Bucket created", { bucket });
  }
  bucketCache.add(bucket);
};
