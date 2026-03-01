# Final-Project-FSD

## Backend

### Overview
- API gateway built with Express and TypeScript
- Modular routing for Auth, Profile, Assignments, and Interviews
- Upload endpoint backed by S3
- Async messaging via [Upstash QStash](https://upstash.com/docs/qstash)

### Prerequisites
- Node.js ≥ 18
- MongoDB (local or Atlas)
- AWS S3 bucket (for file uploads)
- Upstash QStash account — grab your credentials from the [Upstash Console](https://console.upstash.com/qstash)

### Scripts
Run these from the backend folder:

```bash
npm run dev
npm run build
npm run start
```

### Environment variables
Copy `backend/.env.example` to `backend/.env` and fill in the values:

```bash
PORT=4000
BASE_URL=http://localhost:4000
MONGODB_URI=mongodb://localhost:27017/fsd
AWS_REGION=us-east-1
S3_BUCKET=your-bucket-name

# QStash
QSTASH_TOKEN=<your-qstash-token>
QSTASH_CURRENT_SIGNING_KEY=<from-upstash-console>
QSTASH_NEXT_SIGNING_KEY=<from-upstash-console>
```

### QStash messaging

**Publishing** — use `publishEvent` anywhere in the backend:

```typescript
import { publishEvent } from "./services/mq.service.js";

await publishEvent("file-ingested", { fileKey, userId });
```

Available topics:

| Topic | Internal endpoint |
|---|---|
| `file-ingested` | `POST /api/v1/internal/extract-text` |
| `analysis-requested` | `POST /api/v1/internal/analyze-ai` |

**Signature verification** — all `/api/v1/internal/*` routes are guarded by `verifyQStash` middleware. In development without signing keys the middleware is bypassed; in production it returns 401.

### API routes
- `GET /health`
- `POST /api/uploads`
- `GET /api/auth/ping`
- `GET /api/profile/ping`
- `GET /api/assignments/ping`
- `GET /api/interviews/ping`
- `POST /api/v1/internal/extract-text` (QStash only)
- `POST /api/v1/internal/analyze-ai` (QStash only)
