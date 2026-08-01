import type { Request, Response, NextFunction } from 'express';
import { appLogger } from '../services/logger.js';

export interface ResponseTimeOptions {
  /** Threshold in milliseconds above which a request is considered slow (default: 1000) */
  slowThresholdMs?: number;
  /** Log level for slow requests (default: 'warn') */
  slowLogLevel?: 'warn' | 'error';
  /** Whether to include the response time header in the response (default: true) */
  includeHeader?: boolean;
  /** Header name for the response time (default: 'X-Response-Time') */
  headerName?: string;
}

const DEFAULT_OPTIONS: Required<ResponseTimeOptions> = {
  slowThresholdMs: 1000,
  slowLogLevel: 'warn',
  includeHeader: true,
  headerName: 'X-Response-Time',
};

/**
 * Express middleware that measures and logs API response times.
 * Slow requests (above threshold) are logged with a warning.
 */
export function responseTime(opts: ResponseTimeOptions = {}) {
  const options = { ...DEFAULT_OPTIONS, ...opts };

  return (req: Request, res: Response, next: NextFunction): void => {
    const start = process.hrtime.bigint();

    const onFinish = () => {
      cleanup();
      const durationNs = Number(process.hrtime.bigint() - start);
      const durationMs = durationNs / 1e6;
      const rounded = Math.round(durationMs * 100) / 100;

      if (options.includeHeader) {
        // Only set header if headers haven't been sent
        if (!res.headersSent) {
          res.setHeader(options.headerName, `${rounded}ms`);
        }
      }

      const logData = {
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        responseTimeMs: rounded,
        requestId: req.requestId,
      };

      if (rounded > options.slowThresholdMs) {
        appLogger[options.slowLogLevel](
          `Slow request detected: ${req.method} ${req.originalUrl} took ${rounded}ms`,
          logData
        );
      } else {
        appLogger.debug('Request completed', logData);
      }
    };

    const onClose = () => {
      cleanup();
    };

    const cleanup = () => {
      res.removeListener('finish', onFinish);
      res.removeListener('close', onClose);
    };

    res.on('finish', onFinish);
    res.on('close', onClose);

    next();
  };
}
