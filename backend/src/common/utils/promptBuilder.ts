
import { GeminiContent } from '../types/geminiTypes.js'
import { PromptMetadata, PromptVersion } from '../types/promptTypes.js'
import { GeminiPayload } from '../services/geminiClient.js'


const PROMPT_VERSIONS: Record<PromptVersion, string> = {
  v1: '2024-01-01',   // Initial release
  v2: '2025-06-01',   // Added skills/experience extraction + metadata context
};

const DEFAULT_VERSION: PromptVersion = 'v2';

export class PromptBuilder {
  private readonly version: PromptVersion;

  constructor(version: PromptVersion = DEFAULT_VERSION) {
    if (!PROMPT_VERSIONS[version]) {
      throw new Error(`Unknown prompt version: ${version}. Valid: ${Object.keys(PROMPT_VERSIONS).join(', ')}`);
    }
    this.version = version;
  }

  get currentVersion(): PromptVersion    { return this.version; }
  get releaseDate():    string           { return PROMPT_VERSIONS[this.version]; }

 
  buildPayload(transcript: string, metadata: PromptMetadata): GeminiPayload {
    const systemInstruction = this.buildSystemInstruction();
    const userMessage       = this.buildUserMessage(transcript, metadata);

    return {
      system_instruction: {
        parts: [{ text: systemInstruction }],
      },
      contents: [userMessage],
    };
  }

  private buildSystemInstruction(): string {
    return `You are an expert job interview coach and talent assessor (Prompt ${this.version}, released ${PROMPT_VERSIONS[this.version]}).

Your role is to:
1. Evaluate interview answers using the STAR method (Situation, Task, Action, Result)
2. Extract specific technical skills and experience demonstrated in the answer
3. Return a precise, structured JSON analysis — no prose, no markdown

Output contract:
- All scores are integers 0–100
- Skills must be real technologies/methodologies mentioned or strongly implied in the transcript
- Do not invent skills not present in the transcript
- Return ONLY a valid JSON object`;
  }


  private buildUserMessage(transcript: string, metadata: PromptMetadata): GeminiContent {
    const text = this.version === 'v1'
      ? PromptBuilder.buildV1(transcript, metadata)
      : PromptBuilder.buildV2(transcript, metadata);

    return { role: 'user', parts: [{ text }] };
  }


  private static buildV1(transcript: string, metadata: PromptMetadata): string {
    const durationMin = (metadata.durationSeconds / 60).toFixed(2);

    return `## Interview Recording Metadata
Duration : ${metadata.durationSeconds.toFixed(1)}s (${durationMin} min)
Media    : ${metadata.mediaType}
Record ID: ${metadata.recordId}

## Transcript
"""
${transcript}
"""

## Required JSON Output
{
  "overallScore": <integer 0-100>,
  "starAlignment": {
    "score":     <integer 0-100>,
    "situation": { "detected": <boolean>, "feedback": "<string>" },
    "task":      { "detected": <boolean>, "feedback": "<string>" },
    "action":    { "detected": <boolean>, "feedback": "<string>" },
    "result":    { "detected": <boolean>, "feedback": "<string>" }
  },
  "strengths":    ["<string>"],
  "improvements": ["<string>"]
}`;
  }

  private static buildV2(transcript: string, metadata: PromptMetadata): string {
    const durationMin = (metadata.durationSeconds / 60).toFixed(2);
    const jobContext  = metadata.jobId
      ? `Job ID  : ${metadata.jobId}`
      : 'Job ID  : not provided';

    return `## Interview Recording Metadata
Record ID: ${metadata.recordId}
${jobContext}
Media    : ${metadata.mediaType}
Duration : ${metadata.durationSeconds.toFixed(1)}s (${durationMin} min)
Recorded : ${metadata.createdAt}

## Transcript
"""
${transcript}
"""

## Required JSON Output
Return ONLY this JSON object. No markdown, no explanation.

{
  "overallScore": <integer 0-100, holistic quality: content + structure + delivery>,

  "starAlignment": {
    "score":     <integer 0-100, how well STAR method was followed>,
    "situation": { "detected": <boolean>, "feedback": "<1-2 sentence coaching tip>" },
    "task":      { "detected": <boolean>, "feedback": "<1-2 sentence coaching tip>" },
    "action":    { "detected": <boolean>, "feedback": "<1-2 sentence coaching tip>" },
    "result":    { "detected": <boolean>, "feedback": "<1-2 sentence coaching tip>" }
  },

  "skills": [
    {
      "name":        "<exact technology or methodology name, e.g. React.js not just React>",
      "confidence":  <integer 0-100, how confident you are this skill was genuinely demonstrated>,
      "context":     "<one sentence explaining where/how this skill appeared in the transcript>"
    }
  ],

  "experience": [
    {
      "area":        "<domain, e.g. Frontend Development, Team Leadership, System Design>",
      "yearsHinted": <integer or null, any years/duration explicitly mentioned; null if not mentioned>,
      "summary":     "<one sentence describing the experience demonstrated>"
    }
  ],

  "strengths":    ["<specific positive observation tied to transcript content>"],
  "improvements": ["<specific, actionable suggestion tied to transcript content>"]
}

Rules:
- skills[].name must use proper casing: "React.js" not "react", "Node.js" not "node", "TypeScript" not "typescript"
- skills[].confidence >= 70 means clearly demonstrated; < 70 means implied or briefly mentioned
- strengths: 2-4 items
- improvements: 2-4 items
- experience[].yearsHinted: only populate if candidate explicitly states a duration ("3 years", "since 2019")
- If no skills or experience are detected, return empty arrays []`;
  }
}
