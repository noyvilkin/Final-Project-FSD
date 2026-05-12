import { S3FileService } from "./s3FileService.js";
import type { IFileService } from "./IFileService.js";

// Re-exports for consumers.
export { S3FileService } from "./s3FileService.js";
export type { IFileService, FilePutResult } from "./IFileService.js";

// Default singleton. Modules that depend on a file service should accept
// an IFileService parameter (for testability) and fall back to this getter
// in production callers.
let instance: IFileService | null = null;

export function getFileService(): IFileService {
  if (!instance) {
    instance = new S3FileService();
  }
  return instance;
}
