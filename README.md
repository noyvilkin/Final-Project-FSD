# Final-Project-FSD

## Backend

### Overview
- API gateway built with Express and TypeScript
- Modular routing for Auth, Profile, Assignments, and Interviews
- File uploads via MinIO (S3-compatible object storage)
- Async messaging via [Upstash QStash](https://upstash.com/docs/qstash)

### Prerequisites
- Node.js ≥ 18
- Docker
- MongoDB (local or Atlas)
- Upstash QStash account — [Upstash Console](https://console.upstash.com/qstash)

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
BASE_URL=http://localhost:4000
MONGODB_URI=mongodb://localhost:27017/fsd

# MinIO
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_BUCKET_NAME=careerpilot-uploads

# QStash
QSTASH_TOKEN=<your-qstash-token>
QSTASH_CURRENT_SIGNING_KEY=<from-upstash-console>
QSTASH_NEXT_SIGNING_KEY=<from-upstash-console>
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

### QStash messaging

Publish events from anywhere in the backend:

```typescript
import { publishEvent } from "./services/mq.service.js";
await publishEvent("file-ingested", { fileKey, userId });
```

| Topic | Endpoint |
|---|---|
| `file-ingested` | `POST /api/v1/internal/extract-text` |
| `analysis-requested` | `POST /api/v1/internal/analyze-ai` |
| `results-generated` | `POST /api/v1/internal/generate-results` |

Internal routes are guarded by QStash signature verification. Bypassed in dev when signing keys are absent.

### API routes
- `GET /health`
- `POST /api/uploads`
- `POST /api/v1/internal/extract-text`
- `POST /api/v1/internal/analyze-ai`
- `POST /api/v1/internal/generate-results`
