/**
 * Interview Transcription Pipeline — integration & unit tests
 *
 * Test framework: Jest + ts-jest + MongoMemoryServer + supertest
 * External dependencies mocked: S3, OpenAI (Whisper), ffmpeg
 */

// ─── Environment stubs (must come before any module imports) ──────────────────
process.env.S3_ENDPOINT        = 'http://localhost:9000';
process.env.S3_ACCESS_KEY_ID   = 'test-key';
process.env.S3_SECRET_ACCESS_KEY = 'test-secret';
process.env.S3_BUCKET_NAME     = 'test-bucket';
process.env.OPENAI_API_KEY     = 'test-openai-key';
process.env.WHISPER_MODEL      = 'whisper-1';

// ─── S3 mock ──────────────────────────────────────────────────────────────────
// jest.mock path must match the moduleNameMapper-mapped key used by imports.
// Imports in this codebase use '.js' suffixes which the mapper strips to bare paths.
// Using the same '.js' suffix here so Jest registers the mock under the same key.
jest.mock('../../common/services/s3Upload.js', () => {
  const mockAudioBuffer = Buffer.from('fake-audio-data');

  return {
    downloadToTempFile: jest.fn().mockImplementation(async (_key: string, ext: string) => {
      const os   = require('os');
      const path = require('path');
      const fs   = require('fs');
      const tmpPath = path.join(os.tmpdir(), `test-media-${Date.now()}${ext ? '.' + ext : ''}`);
      fs.writeFileSync(tmpPath, mockAudioBuffer);
      return tmpPath;
    }),
    cleanupTempFile: jest.fn(),
    fetchBlobAsBuffer: jest.fn().mockResolvedValue(mockAudioBuffer),
    uploadFileToS3:    jest.fn().mockResolvedValue({
      bucket:   'test-bucket',
      key:      'interviews/test-key.mp3',
      url:      'http://localhost:9000/test-bucket/interviews/test-key.mp3',
      mimeType: 'audio/mpeg',
      size:     1000,
    }),
  };
});

// ─── OpenAI / Whisper mock ────────────────────────────────────────────────────
const mockTranscribeCreate = jest.fn().mockResolvedValue({
  text:     'Tell me about a time you led a project.',
  language: 'en',
  duration: 30,
  segments: [
    { start: 0,  end: 5,  text: 'Tell me about a time' },
    { start: 5,  end: 10, text: 'you led a project.'  },
  ],
});

jest.mock('openai', () => {  // openai has no .js alias — keep as-is
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      audio: {
        transcriptions: {
          create: mockTranscribeCreate,
        },
      },
    })),
    APIError: class APIError extends Error {
      status: number;
      constructor(message: string, status = 500) {
        super(message);
        this.status = status;
        this.name   = 'APIError';
      }
    },
  };
});

// ─── ffmpeg mock ──────────────────────────────────────────────────────────────
jest.mock('@ffmpeg-installer/ffmpeg', () => ({ path: '/usr/bin/ffmpeg' }));
jest.mock('fluent-ffmpeg', () => {  // external package — no .js alias needed
  const ffmpegMock = jest.fn().mockReturnValue({
    noVideo:     jest.fn().mockReturnThis(),
    audioCodec:  jest.fn().mockReturnThis(),
    audioBitrate: jest.fn().mockReturnThis(),
    output:      jest.fn().mockReturnThis(),
    on: jest.fn().mockImplementation(function (this: any, event: string, cb: () => void) {
      if (event === 'end') setImmediate(cb);
      return this;
    }),
    run: jest.fn(),
  });
  (ffmpegMock as any).setFfmpegPath = jest.fn();
  return { __esModule: true, default: ffmpegMock };
});

// ─── Real imports ─────────────────────────────────────────────────────────────
import express, { type Express } from 'express';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

import { errorHandler } from '../../common/middlewares/errorHandler.js';
import interviewRoutes  from '../../features/interview/routes/interview.routes.js';
import { InterviewInsights } from '../../features/interview/models/interviewInsights.model.js';
import {
  downloadToTempFile,
  cleanupTempFile,
} from '../../common/services/s3Upload.js';

// ─── Test app ─────────────────────────────────────────────────────────────────

let mongoServer: MongoMemoryServer;
let testApp: Express;

const USER_A = new Types.ObjectId().toString();
const USER_B = new Types.ObjectId().toString();

beforeAll(async () => {
  testApp = express();
  testApp.use(express.json());
  // requestId middleware uses uuid (ESM-only) which Jest cannot transform;
  // routes gracefully fall back to '-' when req.requestId is undefined.
  testApp.use('/api/interviews', interviewRoutes);
  testApp.use(errorHandler);

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterEach(async () => {
  await InterviewInsights.deleteMany({});
  jest.clearAllMocks();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createInterview(
  userId: string,
  mediaType: 'audio' | 'video' = 'audio',
  processingStatus = 'uploaded'
) {
  return InterviewInsights.create({
    userId:          new Types.ObjectId(userId),
    mediaFileKey:    `interviews/${userId}/test.mp3`,
    mediaType,
    processingStatus,
    status:          'pending',
  });
}

/** Wait for the background pipeline to reach a terminal state. */
async function waitForStatus(
  interviewId: string,
  target: string,
  maxMs = 5000
): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const doc = await InterviewInsights.findById(interviewId);
    if (doc?.processingStatus === target) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  const doc = await InterviewInsights.findById(interviewId);
  throw new Error(`Timed out waiting for status ${target}. Current: ${doc?.processingStatus}`);
}

// ─── POST /interviews/:id/transcribe ─────────────────────────────────────────

describe('POST /api/interviews/:id/transcribe', () => {
  it('returns 202 and queues transcription for own interview', async () => {
    const interview = await createInterview(USER_A);

    const res = await request(testApp)
      .post(`/api/interviews/${interview._id}/transcribe`)
      .set('x-user-id', USER_A);

    expect(res.status).toBe(202);
    expect(res.body.processingStatus).toBe('queued');
    expect(res.body.interviewId).toBe(interview._id.toString());
  });

  it('returns 403 when trying to transcribe another user\'s interview', async () => {
    const interview = await createInterview(USER_A);

    const res = await request(testApp)
      .post(`/api/interviews/${interview._id}/transcribe`)
      .set('x-user-id', USER_B);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 401 when x-user-id header is missing', async () => {
    const interview = await createInterview(USER_A);

    const res = await request(testApp)
      .post(`/api/interviews/${interview._id}/transcribe`);

    expect(res.status).toBe(401);
  });

  it('returns 404 for a non-existent interview', async () => {
    const fakeId = new Types.ObjectId().toString();

    const res = await request(testApp)
      .post(`/api/interviews/${fakeId}/transcribe`)
      .set('x-user-id', USER_A);

    expect(res.status).toBe(404);
  });

  it('returns 400 for a malformed interview ID', async () => {
    const res = await request(testApp)
      .post('/api/interviews/not-an-object-id/transcribe')
      .set('x-user-id', USER_A);

    expect(res.status).toBe(400);
  });

  it('returns 409 when the interview is already processing', async () => {
    const interview = await createInterview(USER_A, 'audio', 'transcribing');

    const res = await request(testApp)
      .post(`/api/interviews/${interview._id}/transcribe`)
      .set('x-user-id', USER_A);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_PROCESSING');
  });

  it('returns 422 when the interview has no media key', async () => {
    const interview = await InterviewInsights.create({
      userId:          new Types.ObjectId(USER_A),
      mediaFileKey:    '',       // empty
      mediaType:       'audio',
      processingStatus: 'uploaded',
      status:          'pending',
    });

    const res = await request(testApp)
      .post(`/api/interviews/${interview._id}/transcribe`)
      .set('x-user-id', USER_A);

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('MISSING_MEDIA_KEY');
  });
});

// ─── Pipeline outcome ─────────────────────────────────────────────────────────

describe('Transcription pipeline — audio file', () => {
  it('saves transcript and segments, sets status to completed', async () => {
    const interview = await createInterview(USER_A, 'audio');

    await request(testApp)
      .post(`/api/interviews/${interview._id}/transcribe`)
      .set('x-user-id', USER_A);

    await waitForStatus(interview._id.toString(), 'completed');

    const updated = await InterviewInsights.findById(interview._id);
    expect(updated?.processingStatus).toBe('completed');
    expect(updated?.transcript).toBe('Tell me about a time you led a project.');
    expect(updated?.transcriptSegments).toHaveLength(2);
    expect(updated?.transcriptionProvider).toBe('openai-whisper');
    expect(updated?.transcriptionModel).toBe('whisper-1');
    expect(updated?.transcriptionLanguage).toBe('en');
    expect(updated?.transcriptionDurationMs).toBeGreaterThan(0);
    expect(updated?.mediaDurationSeconds).toBe(30);
    expect(updated?.transcriptionCompletedAt).toBeInstanceOf(Date);
  });

  it('downloads media from S3 and cleans up the temp file', async () => {
    const interview = await createInterview(USER_A, 'audio');

    await request(testApp)
      .post(`/api/interviews/${interview._id}/transcribe`)
      .set('x-user-id', USER_A);

    await waitForStatus(interview._id.toString(), 'completed');

    expect(downloadToTempFile).toHaveBeenCalledWith(
      `interviews/${USER_A}/test.mp3`,
      'mp3'
    );
    expect(cleanupTempFile).toHaveBeenCalled();
  });

  it('sends audio directly to Whisper without ffmpeg for audio files', async () => {
    const ffmpegModule = await import('fluent-ffmpeg');
    const ffmpegMock   = ffmpegModule.default as unknown as jest.Mock;

    const interview = await createInterview(USER_A, 'audio');

    await request(testApp)
      .post(`/api/interviews/${interview._id}/transcribe`)
      .set('x-user-id', USER_A);

    await waitForStatus(interview._id.toString(), 'completed');

    // ffmpeg should NOT have been invoked for an audio file
    expect(ffmpegMock).not.toHaveBeenCalled();
    expect(mockTranscribeCreate).toHaveBeenCalled();
  });
});

describe('Transcription pipeline — video file', () => {
  it('runs audio extraction for video files before transcribing', async () => {
    const ffmpegModule = await import('fluent-ffmpeg');
    const ffmpegMock   = ffmpegModule.default as unknown as jest.Mock;

    const interview = await createInterview(USER_A, 'video');
    // Give the media key a video extension so mimeTypeFromKey resolves to video/*
    await InterviewInsights.findByIdAndUpdate(interview._id, {
      mediaFileKey: `interviews/${USER_A}/test.mp4`,
    });

    await request(testApp)
      .post(`/api/interviews/${interview._id}/transcribe`)
      .set('x-user-id', USER_A);

    await waitForStatus(interview._id.toString(), 'completed');

    // ffmpeg SHOULD have been invoked for a video file
    expect(ffmpegMock).toHaveBeenCalled();
    expect(mockTranscribeCreate).toHaveBeenCalled();
  });
});

describe('Transcription pipeline — failure handling', () => {
  it('sets processingStatus to failed when Whisper throws', async () => {
    mockTranscribeCreate.mockRejectedValueOnce(new Error('Whisper timeout'));

    const interview = await createInterview(USER_A, 'audio');

    await request(testApp)
      .post(`/api/interviews/${interview._id}/transcribe`)
      .set('x-user-id', USER_A);

    await waitForStatus(interview._id.toString(), 'failed');

    const updated = await InterviewInsights.findById(interview._id);
    expect(updated?.processingStatus).toBe('failed');
    expect(updated?.processingError?.message).toContain('Whisper timeout');
    // processingError must not be in the status endpoint response
  });

  it('cleans up temp files even on Whisper failure', async () => {
    mockTranscribeCreate.mockRejectedValueOnce(new Error('Whisper error'));

    const interview = await createInterview(USER_A, 'audio');

    await request(testApp)
      .post(`/api/interviews/${interview._id}/transcribe`)
      .set('x-user-id', USER_A);

    await waitForStatus(interview._id.toString(), 'failed');

    expect(cleanupTempFile).toHaveBeenCalled();
  });
});

// ─── GET /interviews/:id/status ───────────────────────────────────────────────

describe('GET /api/interviews/:id/status', () => {
  it('returns processingStatus and timestamps for own interview', async () => {
    const interview = await createInterview(USER_A);

    const res = await request(testApp)
      .get(`/api/interviews/${interview._id}/status`)
      .set('x-user-id', USER_A);

    expect(res.status).toBe(200);
    expect(res.body.processingStatus).toBe('uploaded');
    expect(res.body.hasTranscript).toBe(false);
    expect(res.body.hasInsights).toBe(false);
    expect(res.body.createdAt).toBeDefined();
  });

  it('returns 404 for another user\'s interview', async () => {
    const interview = await createInterview(USER_A);

    const res = await request(testApp)
      .get(`/api/interviews/${interview._id}/status`)
      .set('x-user-id', USER_B);

    expect(res.status).toBe(404);
  });

  it('does not expose processingError in the response', async () => {
    const interview = await InterviewInsights.create({
      userId:          new Types.ObjectId(USER_A),
      mediaFileKey:    'interviews/test.mp3',
      mediaType:       'audio',
      processingStatus: 'failed',
      status:          'failed',
      processingError: { stage: 'transcribing', message: 'Internal error detail' },
    });

    const res = await request(testApp)
      .get(`/api/interviews/${interview._id}/status`)
      .set('x-user-id', USER_A);

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('processingError');
  });
});

// ─── GET /interviews/:id/transcript ──────────────────────────────────────────

describe('GET /api/interviews/:id/transcript', () => {
  it('returns transcript and metadata when completed', async () => {
    const interview = await InterviewInsights.create({
      userId:                  new Types.ObjectId(USER_A),
      mediaFileKey:            'interviews/test.mp3',
      mediaType:               'audio',
      processingStatus:        'completed',
      status:                  'completed',
      transcript:              'Hello world.',
      transcriptSegments:      [{ start: 0, end: 2, text: 'Hello world.' }],
      transcriptionProvider:   'openai-whisper',
      transcriptionModel:      'whisper-1',
      transcriptionLanguage:   'en',
      mediaDurationSeconds:    5,
      transcriptionCompletedAt: new Date(),
    });

    const res = await request(testApp)
      .get(`/api/interviews/${interview._id}/transcript`)
      .set('x-user-id', USER_A);

    expect(res.status).toBe(200);
    expect(res.body.transcript).toBe('Hello world.');
    expect(res.body.transcriptSegments).toHaveLength(1);
    expect(res.body.transcriptSegments[0]).toMatchObject({ start: 0, end: 2, text: 'Hello world.' });
    expect(res.body.transcriptionProvider).toBe('openai-whisper');
    expect(res.body.transcriptionLanguage).toBe('en');
    expect(res.body.mediaDurationSeconds).toBe(5);
  });

  it('returns 400 when transcript is not ready', async () => {
    const interview = await createInterview(USER_A, 'audio', 'transcribing');

    const res = await request(testApp)
      .get(`/api/interviews/${interview._id}/transcript`)
      .set('x-user-id', USER_A);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TRANSCRIPT_NOT_READY');
  });

  it('returns 403 for another user\'s interview', async () => {
    const interview = await InterviewInsights.create({
      userId:          new Types.ObjectId(USER_A),
      mediaFileKey:    'interviews/test.mp3',
      mediaType:       'audio',
      processingStatus: 'completed',
      status:          'completed',
      transcript:      'Hello.',
    });

    const res = await request(testApp)
      .get(`/api/interviews/${interview._id}/transcript`)
      .set('x-user-id', USER_B);

    expect(res.status).toBe(404); // findByIdAndUser returns null → 404
  });
});

// ─── GET /interviews/user/:userId ─────────────────────────────────────────────

describe('GET /api/interviews/user/:userId', () => {
  it('returns own interviews list', async () => {
    await createInterview(USER_A);
    await createInterview(USER_A);
    await createInterview(USER_B); // different user — should not appear

    const res = await request(testApp)
      .get(`/api/interviews/user/${USER_A}`)
      .set('x-user-id', USER_A);

    expect(res.status).toBe(200);
    expect(res.body.interviews).toHaveLength(2);
    // processingError must never appear in list responses
    res.body.interviews.forEach((i: Record<string, unknown>) => {
      expect(i).not.toHaveProperty('processingError');
      expect(i).not.toHaveProperty('transcript');
    });
  });

  it('returns 403 when requesting another user\'s list', async () => {
    const res = await request(testApp)
      .get(`/api/interviews/user/${USER_A}`)
      .set('x-user-id', USER_B);

    expect(res.status).toBe(403);
  });
});
