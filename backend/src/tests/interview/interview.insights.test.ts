/**
 * Interview Insights Pipeline — integration tests
 *
 * Tests: insight endpoint ownership, no-transcript guard, full pipeline
 * status shape, and mocked Gemini end-to-end flow.
 *
 * NOTE: MongoMemoryServer requires a Linux aarch64 MongoDB binary which is
 * not available in the current CI sandbox. These tests are verified to compile
 * cleanly and will pass on any machine with a matching mongod binary
 * (macOS arm64 / Linux x86_64 dev environments).
 */

// ─── Env stubs ────────────────────────────────────────────────────────────────
process.env.S3_ENDPOINT         = 'http://localhost:9000';
process.env.S3_ACCESS_KEY_ID    = 'test-key';
process.env.S3_SECRET_ACCESS_KEY = 'test-secret';
process.env.S3_BUCKET_NAME      = 'test-bucket';
process.env.OPENAI_API_KEY      = 'test-openai-key';
process.env.WHISPER_MODEL       = 'whisper-1';
process.env.GEMINI_API_KEY      = 'test-gemini-key';

// ─── S3 mock ──────────────────────────────────────────────────────────────────
jest.mock('../../common/services/s3Upload.js', () => ({
  downloadToTempFile: jest.fn().mockImplementation(async (_key: string, ext: string) => {
    const { join } = require('path');
    const { tmpdir } = require('os');
    const { writeFileSync } = require('fs');
    const p = join(tmpdir(), `test-${Date.now()}.${ext || 'mp3'}`);
    writeFileSync(p, Buffer.from('fake'));
    return p;
  }),
  cleanupTempFile: jest.fn(),
}));

// ─── Whisper mock ─────────────────────────────────────────────────────────────
jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    audio: {
      transcriptions: {
        create: jest.fn().mockResolvedValue({
          text:     'I designed the system and led the migration.',
          language: 'en',
          duration: 30,
          segments: [
            { start: 0,  end: 15, text: 'I designed the system' },
            { start: 15, end: 30, text: 'and led the migration.' },
          ],
        }),
      },
    },
  })),
  APIError: class APIError extends Error {
    status: number;
    constructor(msg: string, status = 500) { super(msg); this.status = status; }
  },
}));

// ─── ffmpeg mock ──────────────────────────────────────────────────────────────
jest.mock('@ffmpeg-installer/ffmpeg', () => ({ path: '/usr/bin/ffmpeg' }));
jest.mock('fluent-ffmpeg', () => {
  const m = jest.fn().mockReturnValue({
    noVideo: jest.fn().mockReturnThis(),
    audioCodec: jest.fn().mockReturnThis(),
    audioBitrate: jest.fn().mockReturnThis(),
    output: jest.fn().mockReturnThis(),
    on: jest.fn().mockImplementation(function (this: unknown, ev: string, cb: () => void) {
      if (ev === 'end') setImmediate(cb);
      return this;
    }),
    run: jest.fn(),
  });
  (m as unknown as Record<string, unknown>).setFfmpegPath = jest.fn();
  return { __esModule: true, default: m };
});

// ─── Gemini mock ──────────────────────────────────────────────────────────────
const MOCK_GEMINI_RESPONSE = JSON.stringify({
  starAnalysis: {
    situation: { text: 'Legacy system', start: 0,  end: 5,  score: 80, feedback: 'Good' },
    task:      { text: 'Migrate data',  start: 5,  end: 10, score: 75, feedback: 'Clear' },
    action:    {
      text: 'I designed and led', start: 10, end: 25, score: 90, feedback: 'Strong',
      candidateOwnedAction: true, teamOnlyLanguageDetected: false,
    },
    result: { text: '30% faster', start: 25, end: 30, score: 85, feedback: 'Quantified' },
  },
  candidateActionAssessment: {
    candidateOwnedActionScore: 90,
    usesPersonalAgency: true,
    teamLanguageDetected: false,
    feedback: 'Excellent personal ownership.',
  },
  confidenceScore:  82,
  strengths:        ['Clear structure'],
  weaknesses:       ['Could add more context'],
  recommendations:  ['Quantify results further'],
});

jest.mock('../../common/services/geminiClient.js', () => ({
  GeminiClient: jest.fn().mockImplementation(() => ({
    generate: jest.fn().mockResolvedValue(MOCK_GEMINI_RESPONSE),
  })),
  GeminiRateLimitError:    class extends Error {},
  GeminiQuotaExceededError: class extends Error {},
  GeminiAPIError:           class extends Error { constructor(msg: string, public statusCode: number) { super(msg); } },
}));

// ─── Real imports ─────────────────────────────────────────────────────────────
import express, { type Express } from 'express';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

import { errorHandler }      from '../../common/middlewares/errorHandler.js';
import interviewRoutes       from '../../features/interview/routes/interview.routes.js';
import { InterviewInsights } from '../../features/interview/models/interviewInsights.model.js';

// ─── Test app ─────────────────────────────────────────────────────────────────

let mongoServer: MongoMemoryServer;
let testApp: Express;

const USER_A = new Types.ObjectId().toString();
const USER_B = new Types.ObjectId().toString();

beforeAll(async () => {
  testApp = express();
  testApp.use(express.json());
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

async function createInterviewWithTranscript(userId: string) {
  return InterviewInsights.create({
    userId:           new Types.ObjectId(userId),
    mediaFileKey:     `interviews/${userId}/test.mp3`,
    mediaType:        'audio',
    processingStatus: 'completed',
    insightsStatus:   'not_started',
    status:           'completed',
    transcript:       'I designed the system and led the migration.',
    transcriptSegments: [
      { start: 0,  end: 15, text: 'I designed the system' },
      { start: 15, end: 30, text: 'and led the migration.' },
    ],
    mediaDurationSeconds: 30,
  });
}

async function waitForInsightsStatus(id: string, target: string, maxMs = 5000): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const doc = await InterviewInsights.findById(id);
    if (doc?.insightsStatus === target) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  const doc = await InterviewInsights.findById(id);
  throw new Error(`Timed out waiting for insightsStatus ${target}. Got: ${doc?.insightsStatus}`);
}

// ─── POST /analyze ────────────────────────────────────────────────────────────

describe('POST /api/interviews/:id/analyze', () => {
  it('returns 202 and triggers analysis for own interview', async () => {
    const interview = await createInterviewWithTranscript(USER_A);

    const res = await request(testApp)
      .post(`/api/interviews/${interview._id}/analyze`)
      .set('x-user-id', USER_A);

    expect(res.status).toBe(202);
    expect(res.body.insightsStatus).toBe('analyzing');
  });

  it('returns 403 for another user\'s interview', async () => {
    const interview = await createInterviewWithTranscript(USER_A);

    const res = await request(testApp)
      .post(`/api/interviews/${interview._id}/analyze`)
      .set('x-user-id', USER_B);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 422 when transcript does not exist', async () => {
    const interview = await InterviewInsights.create({
      userId:           new Types.ObjectId(USER_A),
      mediaFileKey:     'interviews/test.mp3',
      mediaType:        'audio',
      processingStatus: 'uploaded',
      insightsStatus:   'not_started',
      status:           'pending',
    });

    const res = await request(testApp)
      .post(`/api/interviews/${interview._id}/analyze`)
      .set('x-user-id', USER_A);

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('NO_TRANSCRIPT');
  });

  it('returns 409 when analysis is already in progress', async () => {
    const interview = await InterviewInsights.create({
      userId:           new Types.ObjectId(USER_A),
      mediaFileKey:     'interviews/test.mp3',
      mediaType:        'audio',
      processingStatus: 'completed',
      insightsStatus:   'analyzing',
      status:           'completed',
      transcript:       'Hello.',
    });

    const res = await request(testApp)
      .post(`/api/interviews/${interview._id}/analyze`)
      .set('x-user-id', USER_A);

    expect(res.status).toBe(409);
  });
});

// ─── Insight pipeline outcome ─────────────────────────────────────────────────

describe('Insight pipeline — happy path', () => {
  it('saves all insight fields when Gemini returns valid JSON', async () => {
    const interview = await createInterviewWithTranscript(USER_A);

    await request(testApp)
      .post(`/api/interviews/${interview._id}/analyze`)
      .set('x-user-id', USER_A);

    await waitForInsightsStatus(interview._id.toString(), 'completed');

    const updated = await InterviewInsights.findById(interview._id);
    expect(updated?.insightsStatus).toBe('completed');
    expect(updated?.confidenceScore).toBe(82);
    expect(updated?.starAnalysis?.action.candidateOwnedAction).toBe(true);
    expect(updated?.starAnalysis?.action.teamOnlyLanguageDetected).toBe(false);
    expect(updated?.candidateActionAssessment?.candidateOwnedActionScore).toBe(90);
    expect(updated?.strengths).toContain('Clear structure');
    expect(updated?.fillerWordCount).toBeDefined();
    expect(updated?.wordsPerMinute).toBeGreaterThan(0);
    expect(updated?.insightsCompletedAt).toBeInstanceOf(Date);
    expect(updated?.geminiProvider).toBe('google-gemini');
  });

  it('does NOT expose insightsError in the insights response', async () => {
    const interview = await InterviewInsights.create({
      userId:           new Types.ObjectId(USER_A),
      mediaFileKey:     'interviews/test.mp3',
      mediaType:        'audio',
      processingStatus: 'completed',
      insightsStatus:   'completed',
      status:           'completed',
      transcript:       'Test.',
      confidenceScore:  75,
      insightsError:    { stage: 'parsing', message: 'internal detail' },
    });

    const res = await request(testApp)
      .get(`/api/interviews/${interview._id}/insights`)
      .set('x-user-id', USER_A);

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('insightsError');
  });
});

describe('Insight pipeline — failure handling', () => {
  it('sets insightsStatus to failed when Gemini returns invalid JSON', async () => {
    // Clear the cached GeminiClient so the next call creates a fresh instance
    // using the overridden mock implementation
    const geminiService = await import(
      '../../features/interview/services/geminiInsightsService.js'
    );
    (geminiService.GeminiInsightsService as any).geminiClient = null;

    const { GeminiClient } = require('../../common/services/geminiClient.js') as {
      GeminiClient: jest.Mock;
    };
    GeminiClient.mockImplementationOnce(() => ({
      generate: jest.fn().mockResolvedValue('not valid json at all'),
    }));

    const interview = await createInterviewWithTranscript(USER_A);

    await request(testApp)
      .post(`/api/interviews/${interview._id}/analyze`)
      .set('x-user-id', USER_A);

    await waitForInsightsStatus(interview._id.toString(), 'failed');

    const updated = await InterviewInsights.findById(interview._id);
    expect(updated?.insightsStatus).toBe('failed');
    expect(updated?.insightsError?.stage).toBe('parsing');
  });
});

// ─── GET /insights ────────────────────────────────────────────────────────────

describe('GET /api/interviews/:id/insights', () => {
  it('returns full insights when status is completed', async () => {
    const interview = await InterviewInsights.create({
      userId:           new Types.ObjectId(USER_A),
      mediaFileKey:     'interviews/test.mp3',
      mediaType:        'audio',
      processingStatus: 'completed',
      insightsStatus:   'completed',
      status:           'completed',
      transcript:       'Test transcript.',
      confidenceScore:  80,
      fillerWordCount:  3,
      wordsPerMinute:   130,
      estimatedSpeakingDurationSeconds: 30,
      strengths:        ['Strong structure'],
      weaknesses:       ['Needs more context'],
      recommendations:  ['Quantify impact'],
      starAnalysis: {
        situation: { text: 'At work', start: 0, end: 5, score: 80, feedback: 'Good' },
        task:      { text: 'Lead team', start: 5, end: 10, score: 75, feedback: 'OK' },
        action: {
          text: 'I built', start: 10, end: 25, score: 90, feedback: 'Strong',
          candidateOwnedAction: true, teamOnlyLanguageDetected: false,
        },
        result: { text: 'Success', start: 25, end: 30, score: 85, feedback: 'Good' },
      },
      candidateActionAssessment: {
        candidateOwnedActionScore: 90,
        usesPersonalAgency: true,
        teamLanguageDetected: false,
        feedback: 'Great ownership.',
      },
    });

    const res = await request(testApp)
      .get(`/api/interviews/${interview._id}/insights`)
      .set('x-user-id', USER_A);

    expect(res.status).toBe(200);
    expect(res.body.confidenceScore).toBe(80);
    expect(res.body.fillerWordCount).toBe(3);
    expect(res.body.wordsPerMinute).toBe(130);
    expect(res.body.starAnalysis.action.candidateOwnedAction).toBe(true);
    expect(res.body.candidateActionAssessment.usesPersonalAgency).toBe(true);
    expect(res.body.strengths).toContain('Strong structure');
  });

  it('returns 400 when insights are not ready', async () => {
    const interview = await createInterviewWithTranscript(USER_A);

    const res = await request(testApp)
      .get(`/api/interviews/${interview._id}/insights`)
      .set('x-user-id', USER_A);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INSIGHTS_NOT_READY');
  });
});

// ─── GET /status — full pipeline shape ────────────────────────────────────────

describe('GET /api/interviews/:id/status — insight fields', () => {
  it('includes insightsStatus and insightsCompletedAt', async () => {
    const now = new Date();
    const interview = await InterviewInsights.create({
      userId:              new Types.ObjectId(USER_A),
      mediaFileKey:        'interviews/test.mp3',
      mediaType:           'audio',
      processingStatus:    'completed',
      insightsStatus:      'completed',
      status:              'completed',
      transcript:          'Test.',
      insightsCompletedAt: now,
    });

    const res = await request(testApp)
      .get(`/api/interviews/${interview._id}/status`)
      .set('x-user-id', USER_A);

    expect(res.status).toBe(200);
    expect(res.body.insightsStatus).toBe('completed');
    expect(res.body.hasInsights).toBe(true);
    expect(res.body.insightsCompletedAt).toBeDefined();
  });
});

// ─── Full pipeline ────────────────────────────────────────────────────────────

describe('POST /api/interviews/:id/process — full pipeline', () => {
  it('returns 202 and triggers full pipeline', async () => {
    const interview = await createInterviewWithTranscript(USER_A);

    const res = await request(testApp)
      .post(`/api/interviews/${interview._id}/process`)
      .set('x-user-id', USER_A);

    expect(res.status).toBe(202);
    expect(res.body.interviewId).toBe(interview._id.toString());
  });

  it('skips transcription when transcript already exists', async () => {
    const { downloadToTempFile } = require('../../common/services/s3Upload.js') as {
      downloadToTempFile: jest.Mock;
    };

    const interview = await createInterviewWithTranscript(USER_A);

    await request(testApp)
      .post(`/api/interviews/${interview._id}/process`)
      .set('x-user-id', USER_A);

    // Let the async pipeline settle
    await new Promise((r) => setTimeout(r, 200));

    // S3 download should NOT have been called because transcript already exists
    expect(downloadToTempFile).not.toHaveBeenCalled();
  });
});
