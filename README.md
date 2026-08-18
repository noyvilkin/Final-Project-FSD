# SkillUp (Final-Project-FSD)

Career-readiness platform for students and job seekers: **resume / Professional DNA**, **CV optimization**, **programming-assignment grading**, and **interview readiness** (Whisper + STAR feedback).

## Repo layout

| Path | Role |
| --- | --- |
| `backend/` | Express + TypeScript API |
| `frontend/` | React (Vite) SPA |
| `DEPLOYMENT.md` | College server / PM2 deploy notes |

## Prerequisites

- **Node.js** `>=22.13` (or `>=24`) — see `backend/package.json` `engines`
- Docker (for local MinIO)
- MongoDB (local or Atlas)
- Colman VPN + LLM credentials (for AI features)

## Quick start

```bash
# Terminal 1 — MinIO (see below)
# Terminal 2 — backend
cd backend
cp .env.example .env   # then fill Colman + JWT secrets
npm install
npm run dev            # http://localhost:4000

# Terminal 3 — frontend
cd frontend
# create .env with VITE_API_URL=http://localhost:4000
npm install
npm run dev            # http://localhost:5173
```

---

## Backend

### Overview

- Express + TypeScript, feature-sliced routes (Auth, Resume, Profile, Assignments, Interviews)
- File uploads via MinIO (S3-compatible object storage)
- Background analysis pipelines; the client polls for status
- AI via Colman college LLM proxy (provider-agnostic `LLMClient`)

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

Create the bucket and paths (bucket name must match `S3_BUCKET_NAME` in `.env`):

```bash
# Install MinIO client (mc)
brew install minio/stable/mc        # macOS
# or: docker run --rm -it --entrypoint sh minio/mc

mc alias set local http://localhost:9000 minioadmin minioadmin

mc mb local/skillup-uploads

mc cp --attr "content-type=application/x-directory" /dev/null local/skillup-uploads/resumes/
mc cp --attr "content-type=application/x-directory" /dev/null local/skillup-uploads/assignments/
mc cp --attr "content-type=application/x-directory" /dev/null local/skillup-uploads/interviews/
```

Console UI: http://localhost:9001 (login: `minioadmin` / `minioadmin`)

> **Note:** The bucket is also auto-created on first upload by the app.

### Scripts (`backend/`)

```bash
npm run dev              # start API with hot-reload
npm run build            # compile TypeScript
npm run start            # run compiled output
npm test                 # Jest unit/integration tests (no live LLM)
npm run eval:assignment  # live assignment AI eval harness (needs Colman creds)
npm run eval:resume      # live resume AI eval harness
npm run eval:interview   # interview eval harness
npm run verify:pdf       # check assignment fixture PDF extraction
```

### Environment variables

Copy `backend/.env.example` to `backend/.env` and fill in secrets:

```bash
PORT=4000
MONGODB_URI=mongodb://localhost:27017/skillup

# MinIO
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_BUCKET_NAME=skillup-uploads

# Colman LLM service (requires VPN access to the Colman internal network)
COLMAN_LLM_BASE_URL=http://10.10.248.41
# Alternative DNS: http://llm.cs.colman.ac.il
COLMAN_LLM_USERNAME=your-student-username
COLMAN_LLM_PASSWORD=your-student-password
COLMAN_LLM_MODEL=llama3.1:8b

# Optional per-module model overrides (else COLMAN_LLM_MODEL is used)
# COLMAN_LLM_MODEL_ASSIGNMENT=llama3.1:8b
# COLMAN_LLM_MODEL_INTERVIEW=llama3.1:8b
# COLMAN_LLM_MODEL_RESUME=gemma3:12b
# COLMAN_LLM_MODEL_PROFILE_ANALYSIS=gemma2:9b

# Assignment limits (optional)
ASSIGNMENT_DAILY_LIMIT=20   # max non-failed submissions per user per rolling 24h

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

All AI features (resume optimization, hybrid scoring, resume/DNA parsing, profile analysis,
assignment grading, interview insights) go through a single provider-agnostic layer instead
of calling any LLM directly.

**Files involved:**

| File | Role |
|---|---|
| `backend/src/common/services/llmClient.ts` | The `LLMClient` interface every provider implements: `generate(payload)` plus a `model` field. |
| `backend/src/common/services/llmClientFactory.ts` | `createLLMClient(overrides?)` — the **single construction point**. |
| `backend/src/common/services/colmanLLMClient.ts` | `ColmanLLMClient` — Colman OpenAI-compatible endpoint (Basic Auth, ~5 req/min shared limiter, retry/backoff). |
| `backend/src/common/services/llmModuleConfig.ts` | Per-module model resolution (`COLMAN_LLM_MODEL_<MODULE>` → shared `COLMAN_LLM_MODEL` → client default). |
| `backend/src/common/types/llmTypes.ts` | Provider-agnostic payload shape (`system_instruction` + `contents` + `generationConfig`). |

Call sites (all use `createLLMClient()`, never a concrete class):
`hybridScoringService.ts`, `resumeParsingService.ts`, `llmOptimizationService.ts`,
`profileAnalysis.service.ts`, `aiAnalysisService.ts`, `llmInsightsService.ts`.

#### 1. Changing the model (same Colman wrapper)

- **All modules at once:** set `COLMAN_LLM_MODEL` in `backend/.env`.
- **One module only:** set e.g. `COLMAN_LLM_MODEL_ASSIGNMENT=llama3.1:8b` (see `llmModuleConfig.ts`). Features that pass `resolveModelForModule(...)` into `createLLMClient` respect that override.

Check `GET {COLMAN_LLM_BASE_URL}/v1/models` (Basic Auth) for models the server actually hosts — the catalog changes over time (e.g. `gpt-oss-120b` was removed).

Default when nothing is set: hardcoded fallback in `ColmanLLMClient` (`llama3.1:8b`).

#### 2. Changing the wrapper service (provider itself — e.g. Colman → Gemini)

1. Write a new class implementing `LLMClient` (e.g. `geminiLLMClient.ts`) with `model` + `generate(payload)`.
2. Point `createLLMClient()` in `llmClientFactory.ts` at that class.

No feature call site needs to change.

### File uploads

`POST /api/uploads` — multipart form; **auth required**; owner from JWT.

| Field | Path in bucket | Allowed types |
|---|---|---|
| `resumes` | `resumes/` | PDF |
| `assignments` | `assignments/` | ZIP (solution) + PDF (requirements) |
| `interviews` | `interviews/` | audio / video (practice recordings) |

```bash
# Requires a valid auth cookie / Bearer token
curl -X POST http://localhost:4000/api/uploads \
  -H "Cookie: accessToken=..." \
  -F "resumes=@./cv.pdf"
```

### Feature modules

Each feature owns its own routes/services/models under `backend/src/features/`. All AI text
work flows through the shared `LLMClient`; Whisper handles speech-to-text for interviews.

| Module | What it does | AI |
| --- | --- | --- |
| **Auth** | Email/password + Google sign-in; JWT access/refresh cookies | — |
| **Resume** | PDF → Professional DNA; JD keyword extraction; hybrid match score; honest bullet rewrite; `.docx` export | LLM |
| **Profile analysis** | Analysed profile dashboard (top skills, strengths, gaps) | LLM |
| **Assignments** | ZIP solution + PDF requirements → structured grade, requirement coverage, feedback, history | LLM |
| **Interviews** | Audio/video → transcript → STAR / filler-word / pace insights, synced to the recording | Whisper + LLM |

### Background processing

The longer media/AI pipelines (**assignments** and **interviews**) run as background jobs:
the upload request returns immediately and the client polls a status endpoint until the work
reaches a terminal state.

- **Assignments:** `pending → scanning → processing → completed | failed`
  (download → ZIP scan + noise filter → language/framework detect + PDF requirement extraction
  → LLM grading with temp 0 + JSON schema → saved feedback).
- **Interviews:** upload → transcribe (Whisper) → analyse (LLM insights) → poll status → results.

Shorter requests (resume optimization, profile analysis, hybrid score) respond synchronously.

### API routes (summary)

All under `/api` unless noted. Protected routes expect a JWT (cookie or `Authorization` header).

| Area | Examples |
| --- | --- |
| Health | `GET /health` |
| Auth | `POST /api/auth/signup`, `/login`, `/google`, `/refresh`, `/logout` |
| Uploads | `POST /api/uploads` |
| Assignments | `GET /api/assignments/user/:userId`, `GET /:id`, `/:id/status`, `/:id/results`, `DELETE /:id` |
| Resume | `POST /api/resume/upload`, `/optimize`, `/score`, history + artifact download |
| Profile | `POST /api/profile-analysis/upload`, `GET /api/profile-analysis/:userId` |
| Interviews | upload / transcribe / analyze / status / transcript / insights / history |

---

## Frontend

```bash
cd frontend
npm install
npm run dev      # Vite — http://localhost:5173
npm run build
npm run lint
```

Set `VITE_API_URL` to the backend origin (default local: `http://localhost:4000`).
