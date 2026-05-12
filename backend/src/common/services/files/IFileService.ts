// Shared storage adapter — decouples application code from the concrete
// object-storage client. Initial surface is intentionally small; later
// missions (interview media-url endpoint, perf tuning) will extend this
// with `getPresignedUrl` and `head`.

export interface FilePutResult {
  key:       string;
  url:       string;
  sizeBytes: number;
  mimeType:  string;
}

export interface IFileService {
  putBuffer(args: {
    key:      string;
    buffer:   Buffer;
    mimeType: string;
  }): Promise<FilePutResult>;

  getBuffer(key: string): Promise<Buffer>;

  delete(key: string): Promise<void>;
}
