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

# Gemini AI
GEMINI_API_KEY=your-gemini-api-key

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
4. **AI feedback** — source code + requirements are sent to Gemini for grading
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
