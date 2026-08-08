
export interface LLMPart {
  text: string;
}

export interface LLMContent {
  role?:  'user' | 'model';
  parts:  LLMPart[];
}

export interface LLMPayload {
  system_instruction?: { parts: LLMPart[] };
  contents:            LLMContent[];
  /** Per-call overrides merged over the client's default generationConfig. */
  generationConfig?:   Partial<LLMGenerationConfig>;
}

export interface LLMGenerationConfig {
  temperature?:      number;
  maxOutputTokens?:  number;
  responseMimeType?: string;
  /** OpenAPI-subset schema constraining the model to valid, structured JSON. */
  responseSchema?:   unknown;
}
