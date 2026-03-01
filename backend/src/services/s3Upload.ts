import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          sessionToken: process.env.AWS_SESSION_TOKEN,
        }
      : undefined,
});

const sanitizeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_");

type UploadInput = {
  bucket: string;
  file: Express.Multer.File;
  requestId?: string;
};

export const uploadFileToS3 = async ({ bucket, file, requestId }: UploadInput) => {
  const prefix = requestId ?? "upload";
  const key = `${prefix}/${randomUUID()}-${sanitizeName(file.originalname)}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    })
  );

  return {
    bucket,
    key,
    mimeType: file.mimetype,
    size: file.size,
  };
};
