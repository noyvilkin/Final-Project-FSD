export interface PromptMetadata {
  jobId?:          string;
  mediaType:       'audio' | 'video';
  durationSeconds: number;
  recordId:        string;
  createdAt:       string;   // ISO string
}

export type PromptVersion = 'v1' | 'v2';