# Final-Project-FSD

## Backend

### Overview
- API gateway built with Express and TypeScript
- Modular routing for Auth, Profile, Assignments, and Interviews
- File uploads via MinIO (S3-compatible object storage)
- Direct synchronous analysis pipeline (download → scan → AI feedback)

### Prerequisites
- Node.js ≥ 18
- Docker
- MongoDB (local or Atlas)

### MinIO setup

Start the container:

```bash
docker run -d --name minio \
  -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  -v minio-data:/data \
  minio/minio server /data --console-address ":9001"
```

Create the bucket and paths:

```bash
# Install MinIO client (mc)
brew install minio/stable/mc        # macOS
# or: docker run --rm -it --entrypoint sh minio/mc

# Register the local instance
mc alias set local http://localhost:9000 minioadmin minioadmin

# Create bucket
mc mb local/careerpilot-uploads

# Create folder prefixes
mc cp --attr "content-type=application/x-directory" /dev/null local/careerpilot-uploads/resumes/
mc cp --attr "content-type=application/x-directory" /dev/null local/careerpilot-uploads/assignments/
mc cp --attr "content-type=application/x-directory" /dev/null local/careerpilot-uploads/interviews/
```

Console UI: http://localhost:9001 (login: `minioadmin` / `minioadmin`)

> **Note:** The bucket is also auto-created on first upload by the app.

### Scripts

```bash
npm run dev       # start dev server with hot-reload
npm run build     # compile TypeScript
npm run start     # run compiled output
```

### Environment variables
Copy `backend/.env.example` to `backend/.env`:

```bash
PORT=4000
MONGODB_URI=mongodb://localhost:27017/fsd

# MinIO
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_BUCKET_NAME=careerpilot-uploads

# Colman LLM service (requires VPN access to the Colman internal network)
COLMAN_LLM_BASE_URL=http://10.10.248.41
COLMAN_LLM_USERNAME=your-student-username
COLMAN_LLM_PASSWORD=your-student-password
COLMAN_LLM_MODEL=llama3.1:8b

# Auth (JWT + bcrypt)
AUTH_BCRYPT_SALT_ROUNDS=10
JWT_ACCESS_TOKEN_SECRET=replace-with-long-random-string
JWT_REFRESH_TOKEN_SECRET=replace-with-long-random-string
JWT_ACCESS_TOKEN_MAX_AGE_MS=900000
JWT_REFRESH_TOKEN_MAX_AGE_MS=604800000
ACCESS_TOKEN_COOKIE_NAME=accessToken
REFRESH_TOKEN_COOKIE_NAME=refreshToken
AUTH_COOKIE_SECURE=false
AUTH_COOKIE_SAME_SITE=lax

# Google OAuth (optional, enables "Sign in with Google")
GOOGLE_CLIENT_ID=
```

Frontend (`frontend/.env`):

```bash
VITE_API_URL=http://localhost:4000
VITE_GOOGLE_CLIENT_ID=
```

### LLM service integration

All AI features (resume optimization, hybrid scoring, resume/DNA parsing, assignment
grading) go through a single provider-agnostic layer instead of calling any LLM
directly. This is what to know before changing the model or the underlying service.

**Files involved:**

| File | Role |
|---|---|
| `backend/src/common/services/llmClient.ts` | The `LLMClient` interface every provider implements: `generate(payload)` plus a `model` field. This is the only type call sites depend on. |
| `backend/src/common/services/llmClientFactory.ts` | `createLLMClient(overrides?)` — the **single construction point**. Every feature calls this instead of `new SomeClient(...)` directly. |
| `backend/src/common/services/colmanLLMClient.ts` | `ColmanLLMClient` — the current concrete implementation, talking to Colman college's OpenAI-compatible endpoint (Basic Auth, shared 5 req/min rate limiter, retry with back-off). |
| `backend/src/common/types/llmTypes.ts` | `LLMPayload`/`LLMContent`/`LLMPart` — the provider-agnostic wire shape (`system_instruction` + `contents` + `generationConfig`) that every prompt builder produces and every client translates internally. |

Call sites (all resolve their client via `createLLMClient()`, never a concrete class):
`hybridScoringService.ts`, `resumeParsingService.ts`, `llmOptimizationService.ts`,
`aiAnalysisService.ts`.

There are two independent things you can change here — which **model** the current
wrapper service calls, and which **wrapper service** (provider) is used at all.
Changing one never requires changing the other.

#### 1. Changing the model (same wrapper service, e.g. Colman)

To switch which model the current `ColmanLLMClient` calls (e.g. `llama3.1:8b` →
another model hosted by the same Colman server): set `COLMAN_LLM_MODEL` in
`backend/.env`. That's it — no code changes, and it applies to all 4 features at
once, since they all resolve the model through the same factory rather than
hardcoding their own. Check `GET {COLMAN_LLM_BASE_URL}/v1/models` (Basic Auth) for
the current list of models the server actually hosts before switching — the
catalog does change over time, and requesting a model the server doesn't have
returns a 404 (this happened with `gpt-oss-120b`, which was removed from the
server's catalog).

To change the *default* model (used only when `COLMAN_LLM_MODEL` is unset): edit
the one hardcoded fallback in `ColmanLLMClient`'s constructor (`colmanLLMClient.ts`).
It is intentionally the only place that hardcodes a default — `llmClientFactory.ts`
and every call site defer to it rather than keeping their own copy.

#### 2. Changing the wrapper service (the provider itself — e.g. Colman → Gemini)

This is a bigger swap: not "which model on Colman's server" but "don't use Colman
at all, use a different LLM provider (Gemini, OpenAI, another college's endpoint,
etc.)". Because every call site depends only on the `LLMClient` interface — never
on `ColmanLLMClient` directly — this only requires two steps:

1. **Write a new class implementing `LLMClient`** (e.g. `geminiLLMClient.ts`),
   exposing:
   - `readonly model: string` — the model it's configured with (used for the
     "Model: X" label shown in the UI).
   - `generate(payload: LLMPayload): Promise<string>` — takes the same
     provider-agnostic `system_instruction` + `contents` + `generationConfig`
     shape and returns the raw text response.

   Inside `generate()`, translate that shape into whatever the target provider's
   actual API expects (e.g. Gemini's `contents`/`generationConfig` REST shape, or
   OpenAI's `messages` chat-completions shape — see `ColmanLLMClient.toMessages()`
   and `.callAPI()` in `colmanLLMClient.ts` for a worked example of this
   translation, including how `generationConfig.responseSchema`/`responseMimeType`
   map onto that provider's structured-JSON-output feature). This translation
   step matters: every current caller assumes it gets a clean JSON string back,
   and skipping it means falling back to markdown-fence-stripping heuristics,
   which are far less reliable.

2. **Point the factory at it**: in `llmClientFactory.ts`, change what
   `createLLMClient()` constructs and returns (e.g. `new GeminiLLMClient({...})`
   instead of `new ColmanLLMClient({...})`), reading whatever env vars that
   provider needs (e.g. `GEMINI_API_KEY` instead of `COLMAN_LLM_USERNAME`/
   `COLMAN_LLM_PASSWORD`).

No call site (`hybridScoringService.ts`, `resumeParsingService.ts`,
`llmOptimizationService.ts`, `aiAnalysisService.ts`) needs to change — they only
ever call `createLLMClient()` and use the returned `LLMClient`, so the provider
swap is invisible to them.

### File uploads

`POST /api/uploads` — multipart form with field name determining the bucket path:

| Field | Path in bucket | Allowed types |
|---|---|---|
| `resumes` | `resumes/` | PDF |
| `assignments` | `assignments/` | ZIP, PDF |
| `interviews` | `interviews/` | image, video, PDF |

```bash
curl -X POST http://localhost:4000/api/uploads -F "resumes=@./cv.pdf"
```

### Analysis pipeline

When an assignment is uploaded, the backend runs the full pipeline as a direct awaited call:

1. **Upload** — files are stored in MinIO under `assignments/{userId}/{assignmentId}/`
2. **Scan** — ZIP is extracted and source files are parsed
3. **Analyse** — project structure, language, and frameworks are detected
4. **AI feedback** — source code + requirements are sent to the Colman LLM service for grading
5. **Results** — structured feedback is saved to the assignment record

Internal endpoints are available for triggering individual steps:

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/internal/extract-text` | Text extraction (stub) |
| `POST /api/v1/internal/analyze-assignment` | Full scan → AI → results pipeline |
| `POST /api/v1/internal/analyze-ai` | AI analysis only |
| `POST /api/v1/internal/generate-results` | Results compilation |

### API routes
- `GET /health`
- `POST /api/uploads`
- `GET /api/assignments/:assignmentId`
- `GET /api/assignments/:assignmentId/status`
- `GET /api/assignments/:assignmentId/results`
- `POST /api/v1/internal/extract-text`
- `POST /api/v1/internal/analyze-assignment`
- `POST /api/v1/internal/analyze-ai`
- `POST /api/v1/internal/generate-results`
