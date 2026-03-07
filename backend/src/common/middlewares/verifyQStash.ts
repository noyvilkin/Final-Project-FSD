import { Receiver } from "@upstash/qstash";
import type { Request, Response, NextFunction } from "express";
import { appLogger } from "../services/logger.js"

const CURRENT_KEY = process.env.QSTASH_CURRENT_SIGNING_KEY;
const NEXT_KEY = process.env.QSTASH_NEXT_SIGNING_KEY;

if (!CURRENT_KEY || !NEXT_KEY) {
  appLogger.warn(
    "[verifyQStash] Signing keys not configured – " +
      "internal endpoints will reject every request in production"
  );
}

const receiver =
  CURRENT_KEY && NEXT_KEY
    ? new Receiver({ currentSigningKey: CURRENT_KEY, nextSigningKey: NEXT_KEY })
    : null;

export const verifyQStash = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!receiver) {
    if (process.env.NODE_ENV === "production") {
      appLogger.error(
        "[verifyQStash] Signing keys missing in production – rejecting request"
      );
      res.status(401).json({ error: "Unauthorized – signing keys missing" });
      return;
    }

    appLogger.warn("[verifyQStash] Bypassing verification (development mode)");
    next();
    return;
  }

  const signature = req.headers["upstash-signature"];

  if (!signature || typeof signature !== "string") {
    appLogger.warn("[verifyQStash] Missing upstash-signature header");
    res.status(401).json({ error: "Unauthorized – missing signature" });
    return;
  }

  try {
    const body =
      typeof req.body === "string" ? req.body : JSON.stringify(req.body);

    await receiver.verify({ signature, body });
    next();
  } catch (err) {
    appLogger.warn("[verifyQStash] Signature verification failed", {
      error: err,
    });
    res.status(401).json({ error: "Unauthorized – invalid signature" });
  }
};
