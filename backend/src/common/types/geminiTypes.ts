
export interface GeminiPart {
  text: string;
}

export interface GeminiContent {
  role?:  'user' | 'model';
  parts:  GeminiPart[];
}

export interface GeminiPayload {
  system_instruction?: { parts: GeminiPart[] };
  contents:            GeminiContent[];
  /** Per-call overrides merged over the client's default generationConfig. */
  generationConfig?:   Partial<GeminiGenerationConfig>;
}

export interface GeminiGenerationConfig {
  temperature?:      number;
  maxOutputTokens?:  number;
  responseMimeType?: string;
  /** OpenAPI-subset schema constraining the model to valid, structured JSON. */
  responseSchema?:   unknown;
}

export interface GeminiRequestBody {
  system_instruction?: { parts: GeminiPart[] };
  contents:            GeminiContent[];
  generationConfig:    GeminiGenerationConfig;
}

export interface GeminiCandidate {
  content:      GeminiContent;
  finishReason: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER';
}

export interface GeminiAPIResponse {
  candidates?: GeminiCandidate[];
  error?: {
    code:    number;
    message: string;
    status:  string;
  };
}


export interface RateLimiterConfig {
  /** Max requests per rolling minute window */
  requestsPerMinute: number;
  /** Max requests per day (hard cap for free tier) */
  requestsPerDay:    number;
}
