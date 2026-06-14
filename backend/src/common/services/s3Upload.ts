import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { randomUUID } from "crypto";
import { createReadStream } from "fs";
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
  interviewId?: string;
};

export const uploadFileToS3 = async ({ file, path, userId, assignmentId, interviewId }: UploadInput) => {
  await getBucketReady();

  let key: string;

  if (path === 'assignments' && userId && assignmentId) {
    key = `${path}/${userId}/${assignmentId}/${randomUUID()}-${sanitizeName(file.originalname)}`;
  } else if (path === 'interviews' && userId && interviewId) {
    key = `${path}/${userId}/${interviewId}/${randomUUID()}-${sanitizeName(file.originalname)}`;
  } else {
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

// Threshold above which we use S3 multipart upload (10 MB)
const MULTIPART_THRESHOLD = 10 * 1024 * 1024;

/**
 * Upload a media file to S3 using multipart upload for large files.
 * Reads from a disk-based file path (used with multer disk storage)
 * to avoid loading the entire file into memory.
 */
export const uploadMediaToS3 = async ({
  filePath,
  originalName,
  mimeType,
  fileSize,
  storagePath,
  userId,
  interviewId,
}: {
  filePath: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  storagePath: StoragePath;
  userId: string;
  interviewId: string;
}): Promise<{ bucket: string; key: string; url: string; mimeType: string; size: number }> => {
  await getBucketReady();

  const key = `${storagePath}/${userId}/${interviewId}/${randomUUID()}-${sanitizeName(originalName)}`;

  if (fileSize > MULTIPART_THRESHOLD) {
    // Use streaming multipart upload — never buffers entire file in memory
    const stream = createReadStream(filePath);
    const upload = new Upload({
      client: s3,
      params: {
        Bucket: S3_BUCKET,
        Key: key,
        Body: stream,
        ContentType: mimeType,
      },
      // 10 MB parts, up to 4 concurrent uploads
      partSize: MULTIPART_THRESHOLD,
      queueSize: 4,
    });

    await upload.done();
    appLogger.info("[s3] Multipart upload completed", { bucket: S3_BUCKET, key, size: fileSize });
  } else {
    // Small file — read into memory and use simple PutObject
    const { readFile } = await import("fs/promises");
    const buffer = await readFile(filePath);
    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      })
    );
    appLogger.info("[s3] File uploaded", { bucket: S3_BUCKET, key, size: fileSize });
  }

  return {
    bucket: S3_BUCKET,
    key,
    url: `${S3_ENDPOINT}/${S3_BUCKET}/${key}`,
    mimeType,
    size: fileSize,
  };
};

/**
 * Delete a file from S3. Used for cleanup on upload failure.
 */
export const deleteFileFromS3 = async (key: string): Promise<void> => {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    appLogger.info("[s3] Cleanup: file deleted", { bucket: S3_BUCKET, key });
  } catch (err) {
    appLogger.error("[s3] Cleanup: failed to delete file", { key, error: err });
  }
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
