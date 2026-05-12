import {
  deleteBlob,
  fetchBlobAsBuffer,
  uploadBlob,
} from "../s3Upload.js";

import type { FilePutResult, IFileService } from "./IFileService.js";

// Concrete IFileService that delegates to the existing s3Upload helpers
// so we don't fork the S3 client setup, env handling, or bucket-creation
// logic that the rest of the codebase already depends on.
export class S3FileService implements IFileService {
  async putBuffer(args: {
    key:      string;
    buffer:   Buffer;
    mimeType: string;
  }): Promise<FilePutResult> {
    const result = await uploadBlob(args.key, args.buffer, args.mimeType);
    return {
      key:       result.key,
      url:       result.url,
      sizeBytes: args.buffer.length,
      mimeType:  args.mimeType,
    };
  }

  async getBuffer(key: string): Promise<Buffer> {
    return fetchBlobAsBuffer(key);
  }

  async delete(key: string): Promise<void> {
    await deleteBlob(key);
  }
}
