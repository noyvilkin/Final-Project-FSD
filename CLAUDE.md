# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (`backend/`)
```bash
npm run dev        # dev server with hot-reload (tsx + nodemon)
npm run build      # compile TypeScript → dist/
npm run start      # run compiled output (dist/server.js)
npm test           # run all tests with coverage
npm run test:watch # run tests in watch mode
npx jest --testPathPattern=auth  # run a single test file by pattern
```

### Frontend (`frontend/`)
```bash
npm run dev    # Vite dev server (default: http://localhost:5173)
npm run build  # production build
npm run lint   # ESLint
```

### Infrastructure
```bash
# Start MinIO (S3-compatible storage) via Docker
docker run -d --name minio -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin \
  -v minio-data:/data minio/minio server /data --console-address ":9001"
# Console: http://localhost:9001
```

### Environment setup
- Copy `backend/.env.example` → `backend/.env`
- Create `frontend/.env` with `VITE_API_URL=http://localhost:4000`
- Required backend vars: `MONGODB_URI`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`, `JWT_ACCESS_TOKEN_SECRET`, `JWT_REFRESH_TOKEN_SECRET`, `AUTH_BCRYPT_SALT_ROUNDS`, `JWT_ACCESS_TOKEN_MAX_AGE_MS`, `JWT_REFRESH_TOKEN_MAX_AGE_MS`

## Architecture

### Repo layout
Two independent packages sharing no code:
- `backend/` — Express + TypeScript API server
- `frontend/` — React 19 + Vite SPA (plain JSX, no TypeScript)

### Backend structure
```
src/
  app.ts                    # Express app (middleware + route mounting)
  server.ts                 # HTTP listen + DB connect
  common/
    auth/                   # JWT config, token/password/cookie services
    middlewares/            # asyncHandler, errorHandler, requestId, logger, validateUploads
    services/               # s3Upload, database, geminiClient, logger
    utils/                  # zipProcessor, pdfProcessor, promptBuilder, textSanitizer
  features/
    auth/                   # controllers/, routes/, services/
    assignment/             # models/, routes/, services/, POC/
    interview/              # models/, routes/, services/
    resume/                 # models/, routes/, services/, types/, prompts/, POC/
    profile-analysis/       # models/, routes/, services/, prompts/
    upload/                 # routes/ (generic multi-field upload endpoint)
    user/                   # models/, routes/
```

### Module system
TypeScript targets **ES2022 NodeNext modules**. All local imports must use explicit `.js` extensions even though the source files are `.ts`:
```typescript
import { foo } from './bar.js'; // ✅ correct
import { foo } from './bar';    // ❌ will not resolve
```

### Adding a new backend feature
1. Create `src/features/{name}/{models,routes,services}/` as needed.
2. Register routes in `src/app.ts` with `app.use("/api/{name}", ...)`.
3. Wrap async route handlers in `asyncHandler()`.
4. Use static-method service classes (see `AssignmentService`, `InterviewService`).
5. Throw structured errors: `new AuthServiceError(message, httpStatus, errorCode)` — the `errorHandler` middleware catches anything unhandled and returns 500.

### Response envelope
All API responses follow this shape:
```json
{ "fieldName": ..., "requestId": "uuid-or-dash" }
```
Errors:
```json
{ "error": { "code": "SCREAMING_SNAKE_CODE", "message": "human message" }, "requestId": "..." }
```

### Auth system
- JWT pair issued as **HttpOnly cookies** (`accessToken`, `refreshToken`).
- Tokens verified by `AuthTokenService.verifyAccessToken/verifyRefreshToken`.
- Refresh tokens are stored as bcrypt hashes in the `User` document and rotated on every use.
- Many existing routes identify the caller via the `x-user-id` request header (set by the frontend) rather than decoding a JWT. New protected routes should follow the same pattern already established in the feature being extended.
- `auth.config.ts` reads all JWT/cookie env vars at module load time and throws if any are missing.

### S3 / file storage
`src/common/services/s3Upload.ts` — all S3 interaction goes through here:
- `uploadFileToS3({ file, path, userId?, assignmentId?, interviewId? })` — uploads a Multer file buffer; returns `{ bucket, key, url, mimeType, size }`.
- `fetchBlobAsBuffer(key)` / `fetchBlobAsText(key)` — download objects.
- `uploadBlob(key, body, contentType)` — upload raw Buffer/string.
- `deleteBlob(key)` — delete an object.
- S3 paths: `resumes/{uuid}-{name}`, `assignments/{userId}/{assignmentId}/{uuid}-{name}`, `interviews/{userId}/{interviewId}/{uuid}-{name}`.
- The client points to MinIO locally; `forcePathStyle: true` is required.

### Generic upload endpoint
`POST /api/uploads` (multipart form) handles `resumes`, `assignments`, and `interviews` fields in one shot. After S3 upload it creates feature-specific Mongo records (AssignmentFeedback, InterviewInsights). The `validateUploads` middleware enforces MIME types and size limits per field.

### Mongoose schema conventions
- Interfaces `IFoo extends Document` with `Types.ObjectId` for refs.
- Sub-documents use nested `Schema` with `{ _id: false }`.
- Top-level schemas use `{ timestamps: true }` for `createdAt`/`updatedAt`.
- Indexes declared inline: `{ ..., index: true }`.
- Model exported as `export const Foo = mongoose.model<IFoo>('Foo', FooSchema)`.

### Frontend structure
```
src/
  services/api.js          # single axios instance, all API calls exported here
  context/AuthContext.jsx  # useAuth() hook — user, userId, login, logout, signUp, googleLogin
  routes/
    AppRouter.jsx          # all routes defined here
    ProtectedRoute.jsx     # redirects unauthenticated users to /login
  pages/                   # one file per route; use _TemplatePage.jsx as a starting point
  components/
    layouts/               # PageLayout, Header, BottomNav
    ui/                    # Button, Card, Input, Textarea, Badge, Progress
    dashboard/, resume/    # feature-specific components
  layouts/AppLayout.jsx    # wraps authenticated pages
```

### Frontend conventions
- All API calls go through `src/services/api.js`; add new functions there as named exports.
- Auth state comes exclusively from `useAuth()` — never read `localStorage` directly in components.
- Pages get `userId` from `const { userId } = useAuth()`.
- UI primitives live in `components/ui/`; use them rather than raw HTML.
- Tailwind for all styling; no CSS modules.

### Testing
- Tests live in `backend/src/tests/**/*.test.ts`.
- Test framework: **Jest + ts-jest + MongoMemoryServer + supertest**.
- `jest.config.js` maps `.js` imports back to `.ts` sources via `moduleNameMapper`.
- `src/tests/setup-env.js` stubs auth env vars; S3 and DB vars are **not** stubbed — tests that need them must mock at the module level.
- Integration tests spin up `MongoMemoryServer` in `beforeAll` and tear it down in `afterAll`; they clean collections in `afterEach`.
- Run tests sequentially (`maxWorkers: 1`) to avoid Mongoose connection conflicts.
- Coverage is collected only from `src/common/auth/**` and `src/features/auth/**` by default; expand `collectCoverageFrom` in `jest.config.js` when adding coverage for new features.
