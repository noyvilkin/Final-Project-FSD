/**
 * Unit tests for validateUploads middleware — interview-specific rules.
 *
 * Exercises the MIME-type allow-list and per-field size caps without spinning
 * up a real Express server or MongoDB (pure logic tests).
 */

// Stub env vars required by modules that load at import time
process.env.S3_ENDPOINT         = 'http://localhost:9000';
process.env.S3_ACCESS_KEY_ID    = 'test';
process.env.S3_SECRET_ACCESS_KEY = 'test';
process.env.S3_BUCKET_NAME      = 'test';

import type { Request, Response, NextFunction } from 'express';
import { validateUploads } from '../../common/middlewares/validateUploads.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFile(
  mimetype: string,
  size: number,
  originalname = 'test-file'
): Express.Multer.File {
  return {
    fieldname:    'interviews',
    originalname,
    encoding:     '7bit',
    mimetype,
    size,
    buffer:       Buffer.alloc(0),
    destination:  '',
    filename:     originalname,
    path:         '',
    stream:       null as never,
  };
}

function makeReq(
  field: string,
  files: Express.Multer.File[]
): Partial<Request> {
  return {
    files:     { [field]: files },
    requestId: 'test-req',
  };
}

function makeRes() {
  const json = jest.fn().mockReturnThis();
  const status = jest.fn().mockReturnValue({ json });
  return { status, json } as unknown as Response;
}

const next: NextFunction = jest.fn();

// ─── Interview MIME allow-list ─────────────────────────────────────────────────

const MB = 1024 * 1024;

describe('validateUploads — interview MIME types', () => {
  beforeEach(() => jest.clearAllMocks());

  const VALID_AUDIO_TYPES = [
    'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/wav',
    'audio/ogg', 'audio/webm', 'audio/flac', 'audio/x-wav',
  ];

  const VALID_VIDEO_TYPES = [
    'video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo',
  ];

  const INVALID_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/zip',
    'text/plain',
  ];

  VALID_AUDIO_TYPES.forEach((mime) => {
    it(`accepts audio type: ${mime}`, async () => {
      const req = makeReq('interviews', [makeFile(mime, 1 * MB)]);
      const res = makeRes();
      await validateUploads(req as Request, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  VALID_VIDEO_TYPES.forEach((mime) => {
    it(`accepts video type: ${mime}`, async () => {
      const req = makeReq('interviews', [makeFile(mime, 1 * MB)]);
      const res = makeRes();
      await validateUploads(req as Request, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  INVALID_TYPES.forEach((mime) => {
    it(`rejects ${mime} for interviews`, async () => {
      const req = makeReq('interviews', [makeFile(mime, 1 * MB)]);
      const res = makeRes();
      await validateUploads(req as Request, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
  });
});

// ─── Interview file-size cap ───────────────────────────────────────────────────

describe('validateUploads — interview file size', () => {
  beforeEach(() => jest.clearAllMocks());

  const MAX_INTERVIEW_BYTES = 200 * MB;

  it('accepts an audio file at exactly the interview size limit', async () => {
    const req = makeReq('interviews', [makeFile('audio/mpeg', MAX_INTERVIEW_BYTES)]);
    const res = makeRes();
    await validateUploads(req as Request, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('rejects an interview file 1 byte over the 200 MB limit', async () => {
    const req = makeReq('interviews', [makeFile('audio/mpeg', MAX_INTERVIEW_BYTES + 1)]);
    const res = makeRes();
    await validateUploads(req as Request, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a video file over the 200 MB limit', async () => {
    const req = makeReq('interviews', [makeFile('video/mp4', 201 * MB)]);
    const res = makeRes();
    await validateUploads(req as Request, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('does not apply the 200 MB interview limit to resume files', async () => {
    // Resumes use the 20 MB cap, not 200 MB
    const req = makeReq('resumes', [makeFile('application/pdf', 21 * MB)]);
    const res = makeRes();
    await validateUploads(req as Request, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});

// ─── Missing / empty files ─────────────────────────────────────────────────────

describe('validateUploads — edge cases', () => {
  it('returns 400 when files object is missing entirely', async () => {
    const req = { files: undefined, requestId: 'test' } as unknown as Request;
    const res = makeRes();
    await validateUploads(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts an empty files object (no-op)', async () => {
    const req = { files: {}, requestId: 'test' } as unknown as Request;
    const res = makeRes();
    await validateUploads(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
