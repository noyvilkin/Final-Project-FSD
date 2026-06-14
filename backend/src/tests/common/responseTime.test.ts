import { responseTime } from '../../common/middlewares/responseTime.js';
import type { Request, Response, NextFunction } from 'express';
import { appLogger } from '../../common/services/logger.js';

// Mock the logger
jest.mock('../../common/services/logger.js', () => ({
  appLogger: {
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    originalUrl: '/api/test',
    requestId: 'test-req-id',
    ...overrides,
  } as unknown as Request;
}

function createMockRes(): Response & { _listeners: Record<string, Function[]> } {
  const listeners: Record<string, Function[]> = {};
  const res = {
    statusCode: 200,
    headersSent: false,
    _listeners: listeners,
    setHeader: jest.fn(),
    on(event: string, handler: Function) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
      return this;
    },
    removeListener(event: string, handler: Function) {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((h) => h !== handler);
      }
      return this;
    },
  };
  return res as unknown as Response & { _listeners: Record<string, Function[]> };
}

describe('responseTime middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls next() immediately', () => {
    const middleware = responseTime();
    const req = createMockReq();
    const res = createMockRes();
    const next: NextFunction = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('sets X-Response-Time header on response finish', () => {
    const middleware = responseTime();
    const req = createMockReq();
    const res = createMockRes();
    const next: NextFunction = jest.fn();

    middleware(req, res, next);

    // Simulate response finishing
    for (const handler of res._listeners['finish'] || []) {
      handler();
    }

    expect(res.setHeader).toHaveBeenCalledWith(
      'X-Response-Time',
      expect.stringMatching(/^\d+(\.\d+)?ms$/)
    );
  });

  it('uses custom header name when configured', () => {
    const middleware = responseTime({ headerName: 'X-Duration' });
    const req = createMockReq();
    const res = createMockRes();
    const next: NextFunction = jest.fn();

    middleware(req, res, next);

    for (const handler of res._listeners['finish'] || []) {
      handler();
    }

    expect(res.setHeader).toHaveBeenCalledWith(
      'X-Duration',
      expect.stringMatching(/^\d+(\.\d+)?ms$/)
    );
  });

  it('does not set header when includeHeader is false', () => {
    const middleware = responseTime({ includeHeader: false });
    const req = createMockReq();
    const res = createMockRes();
    const next: NextFunction = jest.fn();

    middleware(req, res, next);

    for (const handler of res._listeners['finish'] || []) {
      handler();
    }

    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it('does not set header when headers already sent', () => {
    const middleware = responseTime();
    const req = createMockReq();
    const res = createMockRes();
    res.headersSent = true as any;
    const next: NextFunction = jest.fn();

    middleware(req, res, next);

    for (const handler of res._listeners['finish'] || []) {
      handler();
    }

    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it('logs debug for fast requests (below threshold)', () => {
    const middleware = responseTime({ slowThresholdMs: 60_000 }); // 60s threshold - will never be slow
    const req = createMockReq();
    const res = createMockRes();
    const next: NextFunction = jest.fn();

    middleware(req, res, next);

    for (const handler of res._listeners['finish'] || []) {
      handler();
    }

    expect(appLogger.debug).toHaveBeenCalledWith(
      'Request completed',
      expect.objectContaining({
        method: 'GET',
        url: '/api/test',
        statusCode: 200,
        requestId: 'test-req-id',
        responseTimeMs: expect.any(Number),
      })
    );
    expect(appLogger.warn).not.toHaveBeenCalled();
  });

  it('logs warning for slow requests (above threshold)', () => {
    const middleware = responseTime({ slowThresholdMs: -1 }); // -1ms threshold - everything is slow
    const req = createMockReq();
    const res = createMockRes();
    const next: NextFunction = jest.fn();

    middleware(req, res, next);

    for (const handler of res._listeners['finish'] || []) {
      handler();
    }

    expect(appLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Slow request detected'),
      expect.objectContaining({
        method: 'GET',
        url: '/api/test',
      })
    );
  });

  it('uses error log level when configured for slow requests', () => {
    const middleware = responseTime({ slowThresholdMs: 0, slowLogLevel: 'error' });
    const req = createMockReq();
    const res = createMockRes();
    const next: NextFunction = jest.fn();

    middleware(req, res, next);

    for (const handler of res._listeners['finish'] || []) {
      handler();
    }

    expect(appLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Slow request detected'),
      expect.objectContaining({
        method: 'GET',
        url: '/api/test',
      })
    );
  });

  it('cleans up event listeners after finish fires', () => {
    const middleware = responseTime();
    const req = createMockReq();
    const res = createMockRes();
    const next: NextFunction = jest.fn();

    middleware(req, res, next);

    expect(res._listeners['finish']?.length).toBe(1);
    expect(res._listeners['close']?.length).toBe(1);

    // Fire finish
    for (const handler of [...(res._listeners['finish'] || [])]) {
      handler();
    }

    // Listeners should be removed
    expect(res._listeners['finish']?.length).toBe(0);
    expect(res._listeners['close']?.length).toBe(0);
  });

  it('cleans up on close without logging finish', () => {
    const middleware = responseTime();
    const req = createMockReq();
    const res = createMockRes();
    const next: NextFunction = jest.fn();

    middleware(req, res, next);

    // Fire close (client disconnected)
    for (const handler of [...(res._listeners['close'] || [])]) {
      handler();
    }

    expect(res._listeners['finish']?.length).toBe(0);
    expect(res._listeners['close']?.length).toBe(0);
    // No logging should happen on close
    expect(appLogger.debug).not.toHaveBeenCalled();
    expect(appLogger.warn).not.toHaveBeenCalled();
  });

  it('includes responseTimeMs as a number in log data', () => {
    const middleware = responseTime({ slowThresholdMs: 60_000 });
    const req = createMockReq();
    const res = createMockRes();
    const next: NextFunction = jest.fn();

    middleware(req, res, next);

    for (const handler of res._listeners['finish'] || []) {
      handler();
    }

    const logCall = (appLogger.debug as jest.Mock).mock.calls[0];
    const logData = logCall[1];
    expect(typeof logData.responseTimeMs).toBe('number');
    expect(logData.responseTimeMs).toBeGreaterThanOrEqual(0);
  });
});
