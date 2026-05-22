import type { Request, Response, NextFunction } from "express";
import { appLogger } from "../services/logger.js";

export const logger = (req: Request, res: Response, next: NextFunction) => {
  const start = process.hrtime.bigint();
  // Immediate console output so devs always see incoming requests
  // even if structured logger output is not visible for some reason.
  // This helps debug when Winston output appears missing.
  // eslint-disable-next-line no-console
  console.log(`[HTTP] ${req.method} ${req.originalUrl} - incoming (requestId=${req.requestId ?? '-'})`);

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const requestId = req.requestId ?? "-";

    appLogger.info("request", {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Number(durationMs.toFixed(1)),
      requestId,
    });
  });

  next();
};
