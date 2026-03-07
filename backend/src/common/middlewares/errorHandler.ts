import type { Request, Response, NextFunction } from "express";
import { appLogger } from "../services/logger.js"

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const requestId = req.requestId ?? "-";

  appLogger.error("Unhandled error", {
    requestId,
    error: err,
  });

  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
    },
    requestId,
  });
};
