# DNA Extractor

Resume → structured **Professional DNA** JSON via Gemini.
Self-contained module — depends only on the shared `GeminiClient` and `SkillNormalizer`.

## Public API

```ts
import {
  DnaSchema,
  parseDna,
  DNA_PROMPT_VERSION,
  buildDnaSystemInstruction,
  buildDnaUserMessage,
  buildDnaPayload,
  extractDna,
  estimateTokens,
} from './services/aiServices/dnaExtractor/index.js';

import type {
  DnaResult,
  DnaMetadata,
  DnaPromptInput,
  ExtractDnaParams,
} from './services/aiServices/dnaExtractor/index.js';
```

The high-level entry point is `extractDna({ client, resumeText, metadata })`. It:

1. Truncates the resume text to fit the token budget (`GEMINI_MAX_INPUT_TOKENS`, default `8000`).
2. Builds a system + user payload using the versioned `DNA_PROMPT_VERSION` prompt.
3. Calls Gemini through the shared `GeminiClient` (handles rate limiting + retries).
4. Validates the response with `DnaSchema` (Zod).
5. Normalises skill names with `SkillNormalizer` and dedupes, keeping the highest proficiency.

The returned `DnaResult` shape mirrors `ISkill / IExperience / IEducation` exactly,
so the result can be persisted directly into the `ProfessionalDNA` Mongo model.

## Versioning the prompt

`DNA_PROMPT_VERSION` (in `dnaPrompt.ts`) is the single source of truth for the
prompt's release identity. When changing the prompt:

1. Bump `DNA_PROMPT_VERSION` (e.g. `'v1'` → `'v2'`).
2. Update tests in `__tests__/dnaPrompt.spec.ts` if they assert on the version string.
3. Record the prompt change in the commit message so we can correlate output drift.

## Environment

| Var | Default | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | — | Required. Gemini auth. |
| `GEMINI_MAX_INPUT_TOKENS` | `8000` | Upper bound on resume text before truncation. |

## Smoke test

```bash
# from backend/
GEMINI_API_KEY=... npm run poc:dna
```

The script (`POC/poc-dna-test.ts`) loads `POC/fixtures/sample-resume.txt`,
calls `extractDna`, and prints the resulting JSON + a summary line. Use it to
sanity-check prompt or schema changes against a live Gemini response.

## Unit tests

```bash
npx jest src/services/aiServices/dnaExtractor
```

Covers `parseDna` (fence stripping, malformed JSON, schema violations),
`buildDnaPayload` (system/user shape), and `extractDna` (truncation, skill
normalisation, proficiency-based dedup).
