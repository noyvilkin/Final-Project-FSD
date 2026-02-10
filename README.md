# Final-Project-FSD

## Backend

### Overview
- API gateway built with Express and TypeScript
- Modular routing for Auth, Profile, Assignments, and Interviews
- Upload endpoint backed by S3

### Scripts
Run these from the backend folder:

```bash
npm run dev
npm run build
npm run start
```

### Environment variables
Create a `.env` file in `backend/` with:

```bash
PORT=4000
MONGODB_URI=mongodb://localhost:27017/fsd
AWS_REGION=us-east-1
S3_BUCKET=your-bucket-name
```

### API routes
- `GET /health`
- `POST /api/uploads`
- `GET /api/auth/ping`
- `GET /api/profile/ping`
- `GET /api/assignments/ping`
- `GET /api/interviews/ping`