import OpenAI, { toFile } from "openai";

export interface WhisperSegment {
  start: number;
  end:   number;
  text:  string;
}

export interface WhisperTranscript {
  text:              string;
  segments:          WhisperSegment[];
  languageDetected?: string;
  durationSeconds?:  number;
}

export interface WhisperClientConfig {
  apiKey: string;
  /** OpenAI Whisper model. Default 'whisper-1'. */
  model?: string;
}

// Thin wrapper around OpenAI Whisper. The interview transcription service
// (features/interview/services/transcriptionService.ts) uses this through
// dependency injection so tests can substitute a mock without touching
// the network.
export class WhisperClient {
  private readonly client: OpenAI;
  private readonly model:  string;

  constructor(config: WhisperClientConfig) {
    if (!config.apiKey) {
      throw new Error("WhisperClient: apiKey is required");
    }
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model  = config.model ?? "whisper-1";
  }

  async transcribe(args: {
    buffer:   Buffer;
    filename: string;
    mimeType: string;
  }): Promise<WhisperTranscript> {
    const file = await toFile(args.buffer, args.filename, { type: args.mimeType });

    const response = await this.client.audio.transcriptions.create({
      file,
      model:                    this.model,
      response_format:          "verbose_json",
      timestamp_granularities:  ["segment"],
    });

    // The verbose_json response includes segments + language + duration that
    // the SDK's narrow type doesn't always expose. Read defensively.
    const verbose = response as unknown as {
      text?:     string;
      segments?: Array<{ start: number; end: number; text: string }>;
      language?: string;
      duration?: number;
    };

    return {
      text:             verbose.text ?? "",
      segments:         (verbose.segments ?? []).map((s) => ({
        start: s.start,
        end:   s.end,
        text:  s.text,
      })),
      languageDetected: verbose.language,
      durationSeconds:  verbose.duration,
    };
  }
}
